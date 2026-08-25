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

  it("adds several at once", async () => {
    const user = userEvent.setup();
    render(<AddCombatants entries={entries} />);
    await user.click(screen.getByRole("button", { name: /add Goblin Warrior/i }));
    const stepper = screen.getByLabelText(/quantity/i);
    await user.clear(stepper);
    await user.type(stepper, "6");
    await user.type(screen.getByLabelText(/initiative/i), "13");
    await user.click(screen.getByRole("button", { name: /add 6/i }));
    expect(Object.keys(useEncounter.getState().encounter.combatants)).toHaveLength(6);
  });

  it("leaves the entry unrolled when the GM adds without typing an initiative", async () => {
    const user = userEvent.setup();
    render(<AddCombatants entries={entries} />);
    await user.click(screen.getByRole("button", { name: /add Goblin Warrior/i }));
    await user.click(screen.getByRole("button", { name: /add 1 goblin warrior/i }));
    expect(useEncounter.getState().encounter.entries[0]!.initiative).toBeNull();
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

  it("puts a present player into the encounter with a typed initiative, carrying AC and saves", async () => {
    const user = userEvent.setup();
    useEncounter.getState().setPlayers([
      { id: "p1", name: "Valeria", level: 4, ac: 21, hp: 44,
        saves: { fortitude: 10, reflex: 12, will: 9 }, present: true, initiativeModifier: null },
    ]);
    render(<PartyManager />);

    await user.type(screen.getByLabelText(/initiative for valeria/i), "18");
    await user.click(screen.getByRole("button", { name: /add to encounter/i }));

    const combatant = Object.values(useEncounter.getState().encounter.combatants)[0]!;
    expect(combatant.kind).toBe("pc");
    expect(combatant.name).toBe("Valeria");
    expect(combatant.ac).toBe(21);
    expect(combatant.saves).toEqual({ fortitude: 10, reflex: 12, will: 9 });
    expect(combatant.hp).toEqual({ current: 44, max: 44 });
    expect(useEncounter.getState().encounter.entries[0]!.initiative).toBe(18);
  });

  it("captures HP through the party roster's own field", async () => {
    const user = userEvent.setup();
    render(<PartyManager />);
    await user.click(screen.getByRole("button", { name: /add player/i }));
    await user.type(screen.getByLabelText(/^name/i), "Kesten");
    await user.type(screen.getByLabelText(/^hp/i), "37");

    expect(useEncounter.getState().players[0]!.hp).toBe(37);
  });

  it("seeds the PC's HP from the party roster instead of leaving it null", async () => {
    const user = userEvent.setup();
    useEncounter.getState().setPlayers([
      { id: "p1", name: "Kesten", level: 5, ac: 22, hp: 60,
        saves: { fortitude: 12, reflex: 9, will: 10 }, present: true, initiativeModifier: null },
    ]);
    render(<PartyManager />);
    await user.type(screen.getByLabelText(/initiative for kesten/i), "10");
    await user.click(screen.getByRole("button", { name: /add to encounter/i }));

    const combatant = Object.values(useEncounter.getState().encounter.combatants)[0]!;
    expect(combatant.hp).toEqual({ current: 60, max: 60 });
  });

  it("does not offer to add an absent player to the encounter", () => {
    useEncounter.getState().setPlayers([
      { id: "p1", name: "Absent Al", level: 4, ac: 21,
        saves: { fortitude: 10, reflex: 12, will: 9 }, present: false, initiativeModifier: null },
    ]);
    render(<PartyManager />);
    expect(screen.queryByRole("button", { name: /add to encounter/i })).toBeNull();
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
