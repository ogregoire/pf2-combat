import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AddCombatants, seedFromEntry } from "../src/components/AddCombatants.js";
import { PartyManager } from "../src/components/PartyManager.js";
import { useEncounter } from "../src/state/store.js";
import type { Creature, IndexEntry } from "@pf2/schema";

// Loads a real creature record from the dataset (same idiom as
// action-layout.test.ts and combatant-list.test.tsx) so the perception ->
// initiativeModifier plumbing is exercised against the actual record shape
// rather than a hand-picked fixture. Vitest runs from the repo root (see the
// root vitest.config.ts's `include`).
const dataDir = resolve(process.cwd(), "data/creatures");
function loadRealCreature(id: string): Creature {
  return JSON.parse(readFileSync(resolve(dataDir, `${id}.json`), "utf-8")) as Creature;
}

const entries: IndexEntry[] = [
  { id: "pathfinder-monster-core/goblin-warrior", slug: "goblin-warrior",
    name: "Goblin Warrior", level: -1, rarity: "common", size: "small",
    traits: ["goblin"], ac: 16, hp: 6, remaster: true, book: "Monster Core" },
  { id: "pathfinder-bestiary/troll", slug: "troll", name: "Troll", level: 5,
    rarity: "common", size: "large", traits: ["giant"], ac: 19, hp: 115,
    remaster: false, book: "Pathfinder Bestiary" },
] as IndexEntry[];

// Perception 5 — used by the "totalling the typed die result" tests below,
// which need a known, non-null modifier to add.
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

describe("AddCombatants", () => {
  beforeEach(() => useEncounter.getState().reset());

  it("filters as the GM types", async () => {
    const user = userEvent.setup();
    render(<AddCombatants entries={entries} />);
    await user.type(screen.getByLabelText(/search/i), "gob");
    expect(screen.getByText("Goblin Warrior")).toBeDefined();
    expect(screen.queryByText("Troll")).toBeNull();
  });

  it("shows the source book and marks remaster entries", () => {
    render(<AddCombatants entries={entries} />);
    expect(screen.getByText("Monster Core")).toBeDefined();
    expect(screen.getByText("REMASTER")).toBeDefined();
    expect(screen.getByText(/Pathfinder Bestiary/)).toBeDefined();
  });

  it("caps the render for a broad query and shows how many are hidden", () => {
    const many: IndexEntry[] = Array.from({ length: 80 }, (_, i) => ({
      id: `pack/creature-${i}`, slug: `creature-${i}`, name: `Creature ${i}`,
      level: 1, rarity: "common", size: "medium", traits: [],
      ac: 15, hp: 10, remaster: true, book: "Pack",
    })) as IndexEntry[];
    render(<AddCombatants entries={many} />);
    expect(screen.getByText(/80 matches/)).toBeDefined();
    expect(screen.getAllByRole("button", { name: /^Add Creature/ })).toHaveLength(50);
    expect(screen.getByText(/showing 50, refine your search/i)).toBeDefined();
  });

  // "6 goblins 13" means the GM rolled a 13 — the field is a d20 result, not
  // the final initiative, since the GM is the one rolling a monster's
  // initiative. goblinWarriorCreature's Perception (5) is what gets added.
  // Same rule as the row popover's commitInitiative, reused via
  // rules/initiative.ts's totalInitiative rather than re-derived here.
  it("adds several at once, totalling the typed die result with the creature's modifier", async () => {
    const user = userEvent.setup();
    const loadCreatureFn = async (id: string): Promise<Creature> => {
      expect(id).toBe("pathfinder-monster-core/goblin-warrior");
      return goblinWarriorCreature;
    };
    render(<AddCombatants entries={entries} loadCreatureFn={loadCreatureFn} />);
    await user.click(screen.getByRole("button", { name: /add Goblin Warrior/i }));
    await waitFor(() => expect(screen.queryByTestId("creature-loading")).toBeNull());
    const stepper = screen.getByLabelText(/quantity/i);
    await user.clear(stepper);
    await user.type(stepper, "6");
    await user.type(screen.getByLabelText(/initiative/i), "13");
    await user.click(screen.getByRole("button", { name: /add 6/i }));
    expect(Object.keys(useEncounter.getState().encounter.combatants)).toHaveLength(6);
    // 13 (the typed die result) + 5 (Goblin Warrior's Perception) = 18.
    expect(useEncounter.getState().encounter.entries.every((e) => e.initiative === 18)).toBe(true);
  });

  // No creature record loaded (here: the fetch fails, same "no modifier"
  // case as the row popover) means nothing to add — the typed value commits
  // unchanged rather than inventing a +0.
  it("commits the typed initiative unchanged when the creature has no modifier on record", async () => {
    const user = userEvent.setup();
    const loadCreatureFn = async (): Promise<Creature> => {
      throw new Error("no fixture");
    };
    render(<AddCombatants entries={entries} loadCreatureFn={loadCreatureFn} />);
    await user.click(screen.getByRole("button", { name: /add Goblin Warrior/i }));
    await waitFor(() => expect(screen.queryByTestId("creature-loading")).toBeNull());
    await user.type(screen.getByLabelText(/initiative/i), "13");
    await user.click(screen.getByRole("button", { name: /add 1 goblin warrior/i }));
    expect(useEncounter.getState().encounter.entries[0]!.initiative).toBe(13);
  });

  // As of the initiative-totalling change (a typed number is now a d20
  // result the app adds the creature's Perception to before storing it),
  // an early click doesn't just lose saves/IWR/attacks the way it always
  // did — it also silently commits the raw typed roll unmodified, with no
  // way for the GM to tell that apart from a creature that genuinely has
  // no Perception on record. Kept unresolved on purpose (never settled)
  // so this pins the disabled state itself, not a race against how fast
  // the promise happens to resolve.
  it("disables Add while the creature record is still loading, and re-enables it once resolved", async () => {
    const user = userEvent.setup();
    let resolveCreature!: (c: Creature) => void;
    const loadCreatureFn = () =>
      new Promise<Creature>((resolve) => {
        resolveCreature = resolve;
      });
    render(<AddCombatants entries={entries} loadCreatureFn={loadCreatureFn} />);
    await user.click(screen.getByRole("button", { name: /add Goblin Warrior/i }));

    expect(screen.getByTestId("creature-loading")).toBeDefined();
    const addButton = screen.getByRole("button", { name: /add 1 goblin warrior/i }) as HTMLButtonElement;
    expect(addButton.disabled).toBe(true);

    // A disabled button swallows the click — nothing gets added.
    await user.click(addButton);
    expect(Object.keys(useEncounter.getState().encounter.combatants)).toHaveLength(0);

    resolveCreature(goblinWarriorCreature);
    await waitFor(() => expect(screen.queryByTestId("creature-loading")).toBeNull());
    expect(addButton.disabled).toBe(false);
  });

  it("leaves the entry unrolled when the GM adds without typing an initiative", async () => {
    const user = userEvent.setup();
    render(<AddCombatants entries={entries} />);
    await user.click(screen.getByRole("button", { name: /add Goblin Warrior/i }));
    await user.click(screen.getByRole("button", { name: /add 1 goblin warrior/i }));
    expect(useEncounter.getState().encounter.entries[0]!.initiative).toBeNull();
  });

  // The "act this round instead" hint and what gets parked as trueInitiative
  // must both be driven off the TOTAL (die result + modifier), not the raw
  // typed roll — otherwise a mid-round add can slot into the wrong place.
  // Here the raw roll (15) alone sits below the active entry's 20, but the
  // total (15 + 8 modifier = 23) sits above it, so the hint must still fire.
  it("compares the totalled initiative, not the raw die result, against the active entry for the act-this-round hint", async () => {
    const user = userEvent.setup();
    const loadCreatureFn = async (): Promise<Creature> => ({ ...goblinWarriorCreature, perception: 8 });
    useEncounter.getState().addCombatant(
      { kind: "pc", name: "Valeria", level: 4, ac: 21, saves: { fortitude: 10, reflex: 12, will: 9 }, hp: null },
      20,
    );
    render(<AddCombatants entries={entries} loadCreatureFn={loadCreatureFn} />);
    await user.click(screen.getByRole("button", { name: /add Goblin Warrior/i }));
    await waitFor(() => expect(screen.queryByTestId("creature-loading")).toBeNull());
    await user.type(screen.getByLabelText(/initiative/i), "15");

    expect(await screen.findByText(/slot 23 has passed/i)).toBeDefined();
    await user.click(screen.getByRole("button", { name: /act this round/i }));
    await user.click(screen.getByRole("button", { name: /add 1 goblin warrior/i }));

    const newEntry = useEncounter
      .getState()
      .encounter.entries.find((e) =>
        e.combatantIds.some((id) => useEncounter.getState().encounter.combatants[id]!.kind === "creature"),
      );
    // Parked as the total (23), not the raw roll (15); slotted at or below
    // the active entry's 20 so it still lands after the active turn.
    expect(newEntry!.trueInitiative).toBe(23);
    expect(newEntry!.initiative).toBeLessThanOrEqual(20);
  });

  // Same total (23) but nothing pushes it above the active entry (30), so
  // the hint must not fire — confirms the comparison uses the total rather
  // than always tripping once any modifier is added.
  it("does not show the act-this-round hint when the totalled initiative still falls at or below the active entry's", async () => {
    const user = userEvent.setup();
    const loadCreatureFn = async (): Promise<Creature> => ({ ...goblinWarriorCreature, perception: 8 });
    useEncounter.getState().addCombatant(
      { kind: "pc", name: "Valeria", level: 4, ac: 21, saves: { fortitude: 10, reflex: 12, will: 9 }, hp: null },
      30,
    );
    render(<AddCombatants entries={entries} loadCreatureFn={loadCreatureFn} />);
    await user.click(screen.getByRole("button", { name: /add Goblin Warrior/i }));
    await waitFor(() => expect(screen.queryByTestId("creature-loading")).toBeNull());
    await user.type(screen.getByLabelText(/initiative/i), "15");

    expect(screen.queryByText(/has passed/i)).toBeNull();
  });
});

describe("PartyManager", () => {
  beforeEach(() => useEncounter.getState().reset());

  it("captures AC and all three saves for a player", async () => {
    const user = userEvent.setup();
    render(<PartyManager />);
    await user.click(screen.getByRole("button", { name: /add player/i }));
    await user.type(screen.getByLabelText(/^name/i), "Valeria");
    await user.type(screen.getByLabelText(/^level/i), "4");
    await user.type(screen.getByLabelText(/^ac/i), "21");
    await user.type(screen.getByLabelText(/fortitude/i), "10");
    await user.type(screen.getByLabelText(/reflex/i), "12");
    await user.type(screen.getByLabelText(/will/i), "9");

    const player = useEncounter.getState().players[0]!;
    expect(player).toMatchObject({
      name: "Valeria", level: 4, ac: 21,
      saves: { fortitude: 10, reflex: 12, will: 9 },
    });
  });

  it("captures HP through the party roster's own field", async () => {
    const user = userEvent.setup();
    render(<PartyManager />);
    await user.click(screen.getByRole("button", { name: /add player/i }));
    await user.type(screen.getByLabelText(/^name/i), "Kesten");
    await user.type(screen.getByLabelText(/^hp/i), "37");

    expect(useEncounter.getState().players[0]!.hp).toBe(37);
  });

  // Adding a present player to the encounter moved to QuickAdd (see
  // quick-add.test.tsx) — the drawer's own "Add to encounter" button and
  // Initiative field are gone for both a present and an absent player, not
  // just withheld for the absent case as before.
  it("never offers an Add to encounter button or Initiative field, present or absent", () => {
    useEncounter.getState().setPlayers([
      { id: "p1", name: "Valeria", level: 4, ac: 21,
        saves: { fortitude: 10, reflex: 12, will: 9 }, present: true, initiativeModifier: null },
      { id: "p2", name: "Absent Al", level: 4, ac: 21,
        saves: { fortitude: 10, reflex: 12, will: 9 }, present: false, initiativeModifier: null },
    ]);
    render(<PartyManager />);
    expect(screen.queryByRole("button", { name: /add to encounter/i })).toBeNull();
    expect(screen.queryByLabelText(/initiative for/i)).toBeNull();
  });

  it("toggles presence", async () => {
    const user = userEvent.setup();
    useEncounter.getState().setPlayers([
      { id: "p1", name: "Kesten", level: 5, ac: 22,
        saves: { fortitude: 12, reflex: 9, will: 10 }, present: true, initiativeModifier: null },
    ]);
    render(<PartyManager />);
    await user.click(screen.getByRole("checkbox", { name: /present/i }));
    expect(useEncounter.getState().players[0]!.present).toBe(false);
  });
});

// Not part of the brief's Step 1 fixture — added per the phase-1 requirement
// that this flow (and no other call site yet) denormalises `iwr`,
// `reactions`, `attacks` and `actions` from the full creature record onto
// the combatant. Without this, the damage popover's type selector, the
// reaction watch's trigger text, and the roll assistant's Strikes are all
// inert for anything added from the catalog.
const trollCreature: Creature = {
  id: "pathfinder-bestiary/troll",
  foundryId: "Actor.troll",
  name: "Troll",
  level: 5,
  rarity: "common",
  size: "large",
  traits: ["giant"],
  source: { pack: "pathfinder-bestiary", book: "Pathfinder Bestiary", license: "OGL", remaster: false },
  ac: 19,
  acDetails: null,
  hp: 115,
  hpDetails: null,
  saves: {
    fortitude: { value: 16, detail: null },
    reflex: { value: 10, detail: null },
    will: { value: 8, detail: null },
  },
  immunities: [],
  weaknesses: [
    { type: "fire", value: 10, exceptions: [], doubleVs: [] },
    { type: "acid", value: 10, exceptions: [], doubleVs: [] },
  ],
  resistances: [],
  perception: 11,
  senses: [{ type: "darkvision", acuity: null, range: null }],
  languages: ["Giant"],
  skills: { Athletics: 15 },
  abilityMods: { str: 5, dex: 1, con: 4, int: -2, wis: 0, cha: -1 },
  speeds: [{ type: "land", value: 25 }],
  attacks: [
    {
      name: "Claw", kind: "melee", bonus: 16,
      damage: [{ formula: "2d6+7", type: "slashing", category: null }],
      traits: ["agile"], effects: [],
    },
  ],
  actions: [
    {
      name: "Regeneration", cost: "passive", category: "defensive", traits: [],
      trigger: null, requirements: null, frequency: null,
      description: "<p>Troll regains Hit Points unless it took acid or fire damage.</p>",
    },
    {
      name: "Opportune Grab", cost: "reaction", category: "offensive", traits: [],
      trigger: "The troll hits a creature with a claw Strike", requirements: null, frequency: null,
      description: "<p>The troll automatically grabs the creature.</p>",
    },
  ],
  spellcasting: [],
  gear: [],
  publicNotes: "",
};

describe("seedFromEntry", () => {
  const trollEntry = entries[1]!;

  it("carries iwr, reactions, attacks and actions through from the creature record", () => {
    const seed = seedFromEntry(trollEntry, trollCreature);
    expect(seed.iwr).toEqual({
      immunities: [],
      weaknesses: [
        { type: "fire", value: 10, exceptions: [] },
        { type: "acid", value: 10, exceptions: [] },
      ],
      resistances: [],
    });
    expect(seed.reactions).toEqual([
      { name: "Opportune Grab", trigger: "The troll hits a creature with a claw Strike" },
    ]);
    expect(seed.attacks).toEqual(trollCreature.attacks);
    expect(seed.actions).toEqual(trollCreature.actions);
  });

  it("leaves the four fields empty when no creature record has loaded yet", () => {
    const seed = seedFromEntry(trollEntry, null);
    expect(seed.iwr).toBeNull();
    expect(seed.reactions).toEqual([]);
    expect(seed.attacks).toEqual([]);
    expect(seed.actions).toEqual([]);
  });

  it("carries the creature's perception onto the combatant as its initiative modifier", () => {
    const creature = loadRealCreature("pathfinder-monster-core/forest-troll");
    const entry: IndexEntry = {
      id: creature.id, slug: "forest-troll", name: creature.name, level: creature.level,
      rarity: creature.rarity, size: creature.size, traits: creature.traits,
      ac: creature.ac, hp: creature.hp, remaster: creature.source.remaster, book: creature.source.book,
    };
    const seed = seedFromEntry(entry, creature);
    expect(seed.initiativeModifier).toBe(creature.perception);
  });
});

describe("AddCombatants creature enrichment", () => {
  beforeEach(() => useEncounter.getState().reset());

  it("adds a combatant from the catalog carrying iwr, reactions, attacks and actions off the loaded creature", async () => {
    const user = userEvent.setup();
    const loadCreatureFn = async (id: string): Promise<Creature> => {
      expect(id).toBe("pathfinder-bestiary/troll");
      return trollCreature;
    };
    render(<AddCombatants entries={entries} loadCreatureFn={loadCreatureFn} />);

    await user.click(screen.getByRole("button", { name: /add troll/i }));
    await waitFor(() => expect(screen.queryByTestId("creature-loading")).toBeNull());
    await user.click(screen.getByRole("button", { name: /^add 1 troll$/i }));

    const combatant = Object.values(useEncounter.getState().encounter.combatants)[0]!;
    expect(combatant.iwr).toEqual({
      immunities: [],
      weaknesses: [
        { type: "fire", value: 10, exceptions: [] },
        { type: "acid", value: 10, exceptions: [] },
      ],
      resistances: [],
    });
    expect(combatant.reactions).toEqual([
      { name: "Opportune Grab", trigger: "The troll hits a creature with a claw Strike" },
    ]);
    expect(combatant.attacks).toEqual(trollCreature.attacks);
    expect(combatant.actions).toEqual(trollCreature.actions);
  });
});
