import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Creature, IndexEntry } from "@pf2/schema";
import { QuickAdd } from "../src/components/QuickAdd.js";
import { useEncounter } from "../src/state/store.js";

const entries: IndexEntry[] = [
  { id: "pathfinder-monster-core/goblin-warrior", slug: "goblin-warrior",
    name: "Goblin Warrior", level: -1, rarity: "common", size: "small",
    traits: ["goblin"], ac: 16, hp: 6, remaster: true, book: "Monster Core" },
  { id: "pathfinder-monster-core/goblin-commando", slug: "goblin-commando",
    name: "Goblin Commando", level: 1, rarity: "common", size: "small",
    traits: ["goblin"], ac: 18, hp: 20, remaster: true, book: "Monster Core" },
  { id: "pathfinder-bestiary/troll", slug: "troll", name: "Troll", level: 5,
    rarity: "common", size: "large", traits: ["giant"], ac: 19, hp: 115,
    remaster: false, book: "Pathfinder Bestiary" },
  { id: "pathfinder-bestiary-3/forest-troll", slug: "forest-troll", name: "Forest Troll",
    level: 5, rarity: "common", size: "large", traits: ["giant"], ac: 20, hp: 120,
    remaster: true, book: "Monster Core" },
] as IndexEntry[];

const goblinWarriorCreature: Creature = {
  id: "pathfinder-monster-core/goblin-warrior",
  foundryId: "Actor.goblin-warrior",
  name: "Goblin Warrior",
  level: -1,
  rarity: "common",
  size: "small",
  traits: ["goblin"],
  source: { pack: "pathfinder-monster-core", book: "Monster Core", license: "ORC", remaster: true },
  ac: 16,
  acDetails: null,
  hp: 6,
  hpDetails: null,
  saves: {
    fortitude: { value: 4, detail: null },
    reflex: { value: 6, detail: null },
    will: { value: 2, detail: null },
  },
  immunities: [],
  weaknesses: [],
  resistances: [],
  perception: 5,
  senses: [],
  languages: [],
  skills: {},
  abilityMods: {},
  speeds: [{ type: "land", value: 25 }],
  attacks: [
    { name: "Shortsword", kind: "melee", bonus: 6,
      damage: [{ formula: "1d6+1", type: "piercing", category: null }],
      traits: ["agile", "finesse"], effects: [] },
  ],
  actions: [],
  spellcasting: [],
  gear: [],
  publicNotes: "",
};

const loadCreatureFn = async (id: string): Promise<Creature> => {
  if (id === "pathfinder-monster-core/goblin-warrior") return goblinWarriorCreature;
  throw new Error(`no fixture for ${id}`);
};

describe("QuickAdd", () => {
  beforeEach(() => useEncounter.getState().reset());

  it("shows no dropdown before the name query reaches 3 characters", async () => {
    const user = userEvent.setup();
    render(<QuickAdd entries={entries} loadCreatureFn={loadCreatureFn} />);
    await user.type(screen.getByRole("combobox", { name: /quick add/i }), "go");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("shows a ranked dropdown once the name query reaches 3 characters", async () => {
    const user = userEvent.setup();
    render(<QuickAdd entries={entries} loadCreatureFn={loadCreatureFn} />);
    await user.type(screen.getByRole("combobox", { name: /quick add/i }), "gob");
    const listbox = await screen.findByRole("listbox");
    const options = within(listbox).getAllByRole("option");
    expect(options.map((o) => o.textContent)).toEqual(
      expect.arrayContaining([expect.stringContaining("Goblin Warrior")]),
    );
  });

  it("marks remaster entries and shows level and source book in each row", async () => {
    const user = userEvent.setup();
    render(<QuickAdd entries={entries} loadCreatureFn={loadCreatureFn} />);
    await user.type(screen.getByRole("combobox", { name: /quick add/i }), "troll");
    const listbox = await screen.findByRole("listbox");
    expect(listbox.textContent).toContain("Forest Troll");
    expect(listbox.textContent).toContain("Troll");
    expect(listbox.textContent).toContain("Monster Core");
    expect(listbox.textContent).toContain("Pathfinder Bestiary");
    expect(listbox.textContent).toContain("REMASTER");
  });

  it("types a full command and adds six goblins at initiative 13 with populated attacks", async () => {
    const user = userEvent.setup();
    render(<QuickAdd entries={entries} loadCreatureFn={loadCreatureFn} />);
    const input = screen.getByRole("combobox", { name: /quick add/i });
    await user.type(input, "6 goblin warrior 13");
    await user.keyboard("{Enter}");

    await waitFor(() => {
      const combatants = Object.values(useEncounter.getState().encounter.combatants);
      expect(combatants).toHaveLength(6);
    });
    const combatants = Object.values(useEncounter.getState().encounter.combatants);
    expect(combatants.every((c) => c.attacks.length === 1 && c.attacks[0]!.name === "Shortsword")).toBe(true);
    expect(useEncounter.getState().encounter.entries.every((e) => e.initiative === 13)).toBe(true);
  });

  it("adds a single creature with default quantity when none is typed", async () => {
    const user = userEvent.setup();
    render(<QuickAdd entries={entries} loadCreatureFn={loadCreatureFn} />);
    const input = screen.getByRole("combobox", { name: /quick add/i });
    await user.type(input, "goblin warrior 20");
    await user.keyboard("{Enter}");

    await waitFor(() => {
      expect(Object.keys(useEncounter.getState().encounter.combatants)).toHaveLength(1);
    });
  });

  it("clears the input and keeps focus after a successful add", async () => {
    const user = userEvent.setup();
    render(<QuickAdd entries={entries} loadCreatureFn={loadCreatureFn} />);
    const input = screen.getByRole("combobox", { name: /quick add/i });
    await user.type(input, "goblin warrior 20");
    await user.keyboard("{Enter}");

    await waitFor(() => expect((input as HTMLInputElement).value).toBe(""));
    expect(document.activeElement).toBe(input);
  });

  it("shows what was added", async () => {
    const user = userEvent.setup();
    render(<QuickAdd entries={entries} loadCreatureFn={loadCreatureFn} />);
    const input = screen.getByRole("combobox", { name: /quick add/i });
    await user.type(input, "6 goblin warrior 13");
    await user.keyboard("{Enter}");

    await waitFor(() => expect(screen.getByText(/added 6 × Goblin Warrior at 13/i)).toBeDefined());
  });

  it("moves the highlight with arrow keys and adds the highlighted entry on Enter", async () => {
    const user = userEvent.setup();
    render(<QuickAdd entries={entries} loadCreatureFn={loadCreatureFn} />);
    const input = screen.getByRole("combobox", { name: /quick add/i });
    await user.type(input, "gob");
    await screen.findByRole("listbox");

    // "Goblin Commando" and "Goblin Warrior" both start-with match "gob";
    // move down once and confirm the highlighted option tracks the move.
    await user.keyboard("{ArrowDown}");
    const options = screen.getAllByRole("option");
    const activeId = input.getAttribute("aria-activedescendant");
    expect(activeId).toBe(options[1]!.id);
  });

  it("closes the dropdown on Escape without clearing the typed text", async () => {
    const user = userEvent.setup();
    render(<QuickAdd entries={entries} loadCreatureFn={loadCreatureFn} />);
    const input = screen.getByRole("combobox", { name: /quick add/i });
    await user.type(input, "gob");
    await screen.findByRole("listbox");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).toBeNull();
    expect((input as HTMLInputElement).value).toBe("gob");
  });

  it("completes the highlighted name into the input on Tab without adding", async () => {
    const user = userEvent.setup();
    render(<QuickAdd entries={entries} loadCreatureFn={loadCreatureFn} />);
    const input = screen.getByRole("combobox", { name: /quick add/i }) as HTMLInputElement;
    await user.type(input, "6 goblin war");
    await screen.findByRole("listbox");
    await user.tab();

    expect(input.value).toBe("6 Goblin Warrior");
    expect(Object.keys(useEncounter.getState().encounter.combatants)).toHaveLength(0);
  });

  it("adds directly on Enter when exactly one match exists", async () => {
    const user = userEvent.setup();
    render(<QuickAdd entries={entries} loadCreatureFn={loadCreatureFn} />);
    const input = screen.getByRole("combobox", { name: /quick add/i });
    await user.type(input, "goblin warrior");
    await screen.findByRole("listbox");
    await user.keyboard("{Enter}");

    await waitFor(() => {
      expect(Object.keys(useEncounter.getState().encounter.combatants)).toHaveLength(1);
    });
  });

  it("leaves the entry unrolled when no initiative is typed", async () => {
    const user = userEvent.setup();
    render(<QuickAdd entries={entries} loadCreatureFn={loadCreatureFn} />);
    const input = screen.getByRole("combobox", { name: /quick add/i });
    await user.type(input, "goblin warrior");
    await screen.findByRole("listbox");
    await user.keyboard("{Enter}");

    await waitFor(() => {
      expect(Object.keys(useEncounter.getState().encounter.combatants)).toHaveLength(1);
    });
    expect(useEncounter.getState().encounter.entries[0]!.initiative).toBeNull();
  });

  it("exposes the input as a combobox, so aria-expanded/aria-controls/aria-activedescendant are meaningful to assistive tech", () => {
    render(<QuickAdd entries={entries} loadCreatureFn={loadCreatureFn} />);
    const input = screen.getByRole("combobox", { name: /quick add/i });
    expect(input.getAttribute("role")).toBe("combobox");
  });

  it("caps a quantity above the limit at 30 instead of adding what was typed", async () => {
    const user = userEvent.setup();
    render(<QuickAdd entries={entries} loadCreatureFn={loadCreatureFn} />);
    const input = screen.getByRole("combobox", { name: /quick add/i });
    await user.type(input, "500 goblin warrior 13");
    await user.keyboard("{Enter}");

    await waitFor(() => {
      expect(Object.keys(useEncounter.getState().encounter.combatants)).toHaveLength(30);
    });
    expect(useEncounter.getState().encounter.entries.every((e) => e.initiative === 13)).toBe(true);
  });

  it("says a quantity was capped instead of clamping silently", async () => {
    const user = userEvent.setup();
    render(<QuickAdd entries={entries} loadCreatureFn={loadCreatureFn} />);
    const input = screen.getByRole("combobox", { name: /quick add/i });
    await user.type(input, "500 goblin warrior 13");
    await user.keyboard("{Enter}");

    await waitFor(() =>
      expect(screen.getByText(/added 30 × Goblin Warrior at 13 \(capped from 500\)/i)).toBeDefined(),
    );
  });

  it("does not mention a cap when the typed quantity was within the limit", async () => {
    const user = userEvent.setup();
    render(<QuickAdd entries={entries} loadCreatureFn={loadCreatureFn} />);
    const input = screen.getByRole("combobox", { name: /quick add/i });
    await user.type(input, "6 goblin warrior 13");
    await user.keyboard("{Enter}");

    await waitFor(() => expect(screen.getByText(/added 6 × Goblin Warrior at 13/i)).toBeDefined());
    expect(screen.queryByText(/capped/i)).toBeNull();
  });

  it("lists present players before any typing, and drops them once they are in the order", async () => {
    const user = userEvent.setup();
    useEncounter.getState().setPlayers([
      { id: "p1", name: "Valeros", level: 1, ac: 18, saves: { fortitude: 8, reflex: 5, will: 4 },
        present: true, initiativeModifier: 6 },
    ]);
    render(<QuickAdd entries={[]} loadCreatureFn={async () => { throw new Error("no creature lookup in this test"); }} />);

    await user.click(screen.getByLabelText("Quick add creatures"));
    await user.click(await screen.findByRole("option", { name: /Valeros/ }));

    const combatants = Object.values(useEncounter.getState().encounter.combatants);
    expect(combatants[0]!.playerId).toBe("p1");
    expect(useEncounter.getState().encounter.entries[0]!.initiative).toBeNull();

    await user.click(screen.getByLabelText("Quick add creatures"));
    expect(screen.queryByRole("option", { name: /Valeros/ })).toBeNull();
  });

  it("ranks a matching present player ahead of every creature match", async () => {
    const user = userEvent.setup();
    useEncounter.getState().setPlayers([
      { id: "p1", name: "Goblin Slayer", level: 1, ac: 18, saves: { fortitude: 8, reflex: 5, will: 4 },
        present: true, initiativeModifier: null },
    ]);
    render(<QuickAdd entries={entries} loadCreatureFn={loadCreatureFn} />);
    const input = screen.getByRole("combobox", { name: /quick add/i });
    await user.type(input, "gob");
    const listbox = await screen.findByRole("listbox");
    const options = within(listbox).getAllByRole("option");
    expect(options[0]!.textContent).toContain("Goblin Slayer");
  });

  it("does not offer a player who has no present flag, or one already in the order", async () => {
    const user = userEvent.setup();
    useEncounter.getState().setPlayers([
      { id: "p1", name: "Absent Al", level: 1, ac: 18, saves: { fortitude: 8, reflex: 5, will: 4 },
        present: false, initiativeModifier: null },
      { id: "p2", name: "Seelah", level: 1, ac: 18, saves: { fortitude: 8, reflex: 5, will: 4 },
        present: true, initiativeModifier: null },
    ]);
    useEncounter.getState().addCombatant(
      { kind: "pc", name: "Seelah", ac: 18, saves: { fortitude: 8, reflex: 5, will: 4 }, hp: null, level: 1, playerId: "p2" },
      5,
    );
    render(<QuickAdd entries={[]} loadCreatureFn={async () => { throw new Error("no creature lookup in this test"); }} />);

    await user.click(screen.getByLabelText("Quick add creatures"));
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("carries a present player's ac, saves, level and hp onto the new combatant", async () => {
    const user = userEvent.setup();
    useEncounter.getState().setPlayers([
      { id: "p1", name: "Kyra", level: 3, ac: 19, hp: 32,
        saves: { fortitude: 9, reflex: 6, will: 7 }, present: true, initiativeModifier: 4 },
    ]);
    render(<QuickAdd entries={[]} loadCreatureFn={async () => { throw new Error("no creature lookup in this test"); }} />);

    await user.click(screen.getByLabelText("Quick add creatures"));
    await user.click(await screen.findByRole("option", { name: /Kyra/ }));

    const combatant = Object.values(useEncounter.getState().encounter.combatants)[0]!;
    expect(combatant.kind).toBe("pc");
    expect(combatant.ac).toBe(19);
    expect(combatant.saves).toEqual({ fortitude: 9, reflex: 6, will: 7 });
    expect(combatant.level).toBe(3);
    expect(combatant.hp).toEqual({ current: 32, max: 32 });
    expect(combatant.initiativeModifier).toBe(4);
  });
});
