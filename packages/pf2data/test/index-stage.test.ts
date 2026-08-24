import { describe, expect, it } from "vitest";
import type { Creature } from "@pf2/schema";
import { buildIndexes } from "../src/stages/index.js";

const creature = (
  pack: string,
  slug: string,
  overrides: Partial<Creature> = {},
): Creature =>
  ({
    id: `${pack}/${slug}`,
    foundryId: "x".repeat(16),
    name: slug.replace(/-/g, " "),
    level: 1,
    rarity: "common",
    size: "medium",
    traits: [],
    source: { pack, book: pack, license: "OGL", remaster: false },
    ac: 15,
    hp: 20,
    saves: { fortitude: 5, reflex: 5, will: 5 },
    immunities: [],
    weaknesses: [],
    resistances: [],
    perception: 5,
    senses: [],
    languages: [],
    skills: {},
    abilityMods: {},
    speeds: [],
    attacks: [],
    actions: [],
    spellcasting: [],
    gear: [],
    publicNotes: "",
    ...overrides,
  }) as Creature;

describe("buildIndexes", () => {
  it("groups creatures into one index per pack", () => {
    const build = buildIndexes([
      creature("pathfinder-bestiary", "troll"),
      creature("kingmaker-bestiary", "the-stag-lord"),
    ]);
    expect(Object.keys(build.indexes).sort()).toEqual([
      "kingmaker-bestiary",
      "pathfinder-bestiary",
    ]);
    expect(build.indexes["pathfinder-bestiary"]).toHaveLength(1);
  });

  it("builds a catalog entry per book with counts", () => {
    const build = buildIndexes([
      creature("pathfinder-bestiary", "troll"),
      creature("pathfinder-bestiary", "owlbear"),
    ]);
    expect(build.books).toEqual([
      {
        pack: "pathfinder-bestiary",
        title: "pathfinder-bestiary",
        license: "OGL",
        remaster: false,
        creatureCount: 2,
        indexPath: "index/pathfinder-bestiary.json",
        mixed: false,
      },
    ]);
  });

  it("picks the book title from the majority source and flags a mixed pack", () => {
    const remasterSource = {
      pack: "pathfinder-bestiary",
      book: "Monster Core",
      license: "ORC" as const,
      remaster: true,
    };
    const build = buildIndexes([
      creature("pathfinder-bestiary", "troll"),
      creature("pathfinder-bestiary", "owlbear"),
      // A single out-of-place remaster creature must not decide the book's
      // catalog entry (I5) -- the majority (two OGL/legacy creatures) does,
      // and `mixed` records that the pack isn't uniform.
      creature("pathfinder-bestiary", "phantasmal-minion", { source: remasterSource }),
    ]);
    const book = build.books.find((b) => b.pack === "pathfinder-bestiary")!;
    expect(book.title).toBe("pathfinder-bestiary");
    expect(book.license).toBe("OGL");
    expect(book.remaster).toBe(false);
    expect(book.mixed).toBe(true);
  });

  it("does not flag a uniform pack as mixed", () => {
    const build = buildIndexes([
      creature("pathfinder-bestiary", "troll"),
      creature("pathfinder-bestiary", "owlbear"),
    ]);
    expect(build.books[0]!.mixed).toBe(false);
  });

  it("records cross-pack slug collisions without resolving them", () => {
    const build = buildIndexes([
      creature("pathfinder-bestiary", "barghest"),
      creature("pathfinder-monster-core", "barghest", {
        source: {
          pack: "pathfinder-monster-core",
          book: "Monster Core",
          license: "ORC",
          remaster: true,
        },
      }),
    ]);
    expect(build.collisions).toEqual([
      {
        slug: "barghest",
        ids: ["pathfinder-bestiary/barghest", "pathfinder-monster-core/barghest"],
      },
    ]);
    expect(build.indexes["pathfinder-bestiary"]).toHaveLength(1);
    expect(build.indexes["pathfinder-monster-core"]).toHaveLength(1);
  });

  it("sorts index entries by name", () => {
    const build = buildIndexes([
      creature("pathfinder-bestiary", "zombie"),
      creature("pathfinder-bestiary", "aboleth"),
    ]);
    expect(build.indexes["pathfinder-bestiary"]!.map((e) => e.slug)).toEqual([
      "aboleth",
      "zombie",
    ]);
  });
});
