import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { seedFromEntry } from "../src/data/seed.js";
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

describe("PartyManager", () => {
  beforeEach(() => useEncounter.getState().reset());

  // Every field is plain text until clicked; the row then walks Name → AC →
  // Level → HP → Fortitude → Reflex → Will on Tab (or Enter), opening each
  // next field directly so a new character is filled in one pass.
  it("captures AC and all three saves for a character, walking the fields with Tab", async () => {
    const user = userEvent.setup();
    render(<PartyManager />);
    // Add character opens the new row's Name field itself; typing starts there.
    await user.click(screen.getByRole("button", { name: /add character/i }));
    await user.keyboard("Valeria{Tab}21{Tab}4{Tab}{Tab}10{Tab}12{Tab}9");

    const player = useEncounter.getState().players[0]!;
    expect(player).toMatchObject({
      name: "Valeria", level: 4, ac: 21,
      saves: { fortitude: 10, reflex: 12, will: 9 },
    });
  });

  it("captures HP through the party roster's own field", async () => {
    const user = userEvent.setup();
    render(<PartyManager />);
    await user.click(screen.getByRole("button", { name: /add character/i }));
    await user.keyboard("Kesten{Escape}");
    await user.click(screen.getByRole("button", { name: "HP" }));
    await user.type(screen.getByRole("textbox", { name: "HP" }), "37");

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
