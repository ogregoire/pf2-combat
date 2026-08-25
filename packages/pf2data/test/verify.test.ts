import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Manifest } from "@pf2/schema";
import { normalizeCreature } from "../src/normalize/creature.js";
import { buildIndexes } from "../src/stages/index.js";
import { verifyDataset, verifyI18n } from "../src/stages/verify.js";

const stagLord = normalizeCreature(
  JSON.parse(
    readFileSync(
      fileURLToPath(new URL("./fixtures/the-stag-lord.json", import.meta.url)),
      "utf8",
    ),
  ),
  "kingmaker-bestiary",
  "the-stag-lord",
  {},
);

const manifest = (overrides: Partial<Manifest> = {}): Manifest => ({
  toolVersion: "0.0.0",
  upstreamRepo: "https://github.com/foundryvtt/pf2e",
  upstreamRef: "abc123",
  frRepo: "https://gitlab.com/pathfinder-fr/foundryvtt-pathfinder2-fr",
  frRef: "def456",
  generatedAt: "2026-08-24T00:00:00.000Z",
  packs: ["kingmaker-bestiary"],
  creatureCount: 1,
  collisions: [],
  ...overrides,
});

const baseInput = () => {
  const build = buildIndexes([stagLord]);
  return {
    creatures: [stagLord],
    books: build.books,
    indexes: build.indexes,
    conditions: [],
    glossary: [],
    traits: [],
    manifest: manifest(),
  };
};

describe("verifyDataset", () => {
  it("passes on a consistent dataset", () => {
    const result = verifyDataset(baseInput());
    expect(result).toEqual({ ok: true, failures: [] });
  });

  it("fails when a book count disagrees with its index", () => {
    const input = baseInput();
    input.books[0]!.creatureCount = 99;
    const result = verifyDataset(input);
    expect(result.ok).toBe(false);
    expect(result.failures.join(" ")).toMatch(/creatureCount/);
  });

  it("fails when an alignment trait survives normalization", () => {
    const tainted = { ...stagLord, traits: ["human", "evil"] };
    const build = buildIndexes([tainted]);
    const result = verifyDataset({
      creatures: [tainted],
      books: build.books,
      indexes: build.indexes,
      conditions: [],
      glossary: [],
      traits: [],
      manifest: manifest(),
    });
    expect(result.ok).toBe(false);
    expect(result.failures.join(" ")).toMatch(/alignment/i);
  });

  it("fails when an unresolved uuid link remains", () => {
    const tainted = { ...stagLord, publicNotes: "see @UUID[Compendium.pf2e.x.Item.y]{Z}" };
    const build = buildIndexes([tainted]);
    const result = verifyDataset({
      creatures: [tainted],
      books: build.books,
      indexes: build.indexes,
      conditions: [],
      glossary: [],
      traits: [],
      manifest: manifest(),
    });
    expect(result.ok).toBe(false);
    expect(result.failures.join(" ")).toMatch(/@UUID/);
  });

  it("fails when an unresolved @Localize placeholder remains", () => {
    const tainted = { ...stagLord, publicNotes: "see @Localize[PF2E.NPC.Abilities.Glossary.Grab]" };
    const build = buildIndexes([tainted]);
    const result = verifyDataset({
      creatures: [tainted],
      books: build.books,
      indexes: build.indexes,
      conditions: [],
      glossary: [],
      traits: [],
      manifest: manifest(),
    });
    expect(result.ok).toBe(false);
    expect(result.failures.join(" ")).toMatch(/@Localize/);
  });

  it("fails when the collision set drifts from the manifest", () => {
    const input = baseInput();
    input.manifest = manifest({
      collisions: [{ slug: "barghest", ids: ["a/barghest", "b/barghest"] }],
    });
    const result = verifyDataset(input);
    expect(result.ok).toBe(false);
    expect(result.failures.join(" ")).toMatch(/collision/i);
  });

  it("fails when a book's mixed flag does not match its creatures' source uniformity", () => {
    const input = baseInput();
    // stagLord is the only creature in its pack, so mixed must be false;
    // asserting true is a lie the verifier should catch.
    input.books[0]!.mixed = true;
    const result = verifyDataset(input);
    expect(result.ok).toBe(false);
    expect(result.failures.join(" ")).toMatch(/mixed/i);
  });

  it("fails when a book entry does not validate against its schema", () => {
    const input = baseInput();
    (input.books[0] as { license: string }).license = "not-a-license";
    const result = verifyDataset(input);
    expect(result.ok).toBe(false);
    expect(result.failures.join(" ")).toMatch(/schema: book/);
  });

  it("fails when an index entry does not validate against its schema", () => {
    const input = baseInput();
    const pack = Object.keys(input.indexes)[0]!;
    (input.indexes[pack]![0] as { level: unknown }).level = "not-a-number";
    const result = verifyDataset(input);
    expect(result.ok).toBe(false);
    expect(result.failures.join(" ")).toMatch(/schema: index/);
  });

  it("N4: fails when an unresolved @UUID link remains in a condition description", () => {
    const input = baseInput();
    input.conditions = [
      {
        slug: "grabbed",
        name: "Grabbed",
        isValued: false,
        description: "see @UUID[Compendium.pf2e.x.Item.y]{Z}",
      },
    ];
    const result = verifyDataset(input);
    expect(result.ok).toBe(false);
    expect(result.failures.join(" ")).toMatch(/links: condition grabbed.*@UUID/);
  });

  it("N4: fails when an unresolved @Localize placeholder remains in a glossary description", () => {
    const input = baseInput();
    input.glossary = [
      {
        slug: "grab",
        name: "Grab",
        cost: "1",
        traits: [],
        description: "@Localize[PF2E.NPC.Abilities.Glossary.Grab]",
      },
    ];
    const result = verifyDataset(input);
    expect(result.ok).toBe(false);
    expect(result.failures.join(" ")).toMatch(/links: glossary grab.*@Localize/);
  });

  it("fails when a condition does not validate against its schema", () => {
    const input = baseInput();
    input.conditions = [{ slug: "prone", name: "Prone" /* missing isValued/description */ }];
    const result = verifyDataset(input);
    expect(result.ok).toBe(false);
    expect(result.failures.join(" ")).toMatch(/schema: condition/);
  });

  it("fails when a glossary entry does not validate against its schema", () => {
    const input = baseInput();
    input.glossary = [{ slug: "grab", name: "Grab", cost: "not-a-cost" }];
    const result = verifyDataset(input);
    expect(result.ok).toBe(false);
    expect(result.failures.join(" ")).toMatch(/schema: glossary/);
  });

  it("fails when a trait entry does not validate against its schema", () => {
    const input = baseInput();
    input.traits = [{ slug: "agile" /* missing name/description */ }];
    const result = verifyDataset(input);
    expect(result.ok).toBe(false);
    expect(result.failures.join(" ")).toMatch(/schema: trait agile/);
  });

  it("fails when an unresolved @Localize placeholder remains in a trait description", () => {
    const input = baseInput();
    input.traits = [
      { slug: "agile", name: "Agile", description: "@Localize[PF2E.TraitDescriptionAgile]" },
    ];
    const result = verifyDataset(input);
    expect(result.ok).toBe(false);
    expect(result.failures.join(" ")).toMatch(/links: trait agile.*@Localize/);
  });

  it("passes with well-formed conditions, glossary and trait entries", () => {
    const input = baseInput();
    input.conditions = [
      { slug: "prone", name: "Prone", isValued: false, description: "<p>...</p>" },
    ];
    input.glossary = [
      { slug: "grab", name: "Grab", cost: "1", traits: [], description: "<p>...</p>" },
    ];
    input.traits = [{ slug: "agile", name: "Agile", description: "<p>...</p>" }];
    const result = verifyDataset(input);
    expect(result.ok).toBe(true);
  });
});

describe("verifyI18n", () => {
  // The overlay is keyed by ARRAY POSITION, so it is only ever safe while the
  // overlay and the creature agree position-for-position. An upstream reorder
  // or a dropped item must be a loud failure here, never a silently
  // mistranslated Strike.
  it("fails when an overlay position's English name disagrees with the creature", () => {
    const problems = verifyI18n(
      { id: "p/c", actions: [{ name: "Rend" }], attacks: [] },
      { name: "X", publicNotes: null, actions: [{ en: "Grab", name: "Agripper", description: null }], attacks: [] },
    );
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/Rend/);
    expect(problems[0]).toMatch(/Grab/);
  });

  it("fails when the overlay has a different number of positions than the creature", () => {
    // Creature has 2 actions, overlay has 1 -- an upstream reorder or a dropped
    // item. Index-keying is only safe while the lengths agree.
    expect(verifyI18n(
      { id: "p/c", actions: [{ name: "Rend" }, { name: "Grab" }], attacks: [] },
      { name: "X", publicNotes: null, actions: [{ en: "Rend", name: null, description: null }], attacks: [] },
    )).toHaveLength(1);
  });

  it("passes for an aligned overlay", () => {
    expect(verifyI18n(
      { id: "p/c", actions: [{ name: "Rend" }], attacks: [{ name: "Claw" }] },
      { name: "X", publicNotes: null,
        actions: [{ en: "Rend", name: "Déchiqueter", description: null }],
        attacks: [{ en: "Claw", name: "Griffe" }] },
    )).toEqual([]);
  });

  it("fails when an attack position's English name disagrees, naming the creature", () => {
    const problems = verifyI18n(
      { id: "kingmaker-bestiary/the-stag-lord", actions: [], attacks: [{ name: "Longsword" }] },
      { name: "Seigneur Cerf", publicNotes: null, actions: [], attacks: [{ en: "Composite Longbow", name: "Arc long composite" }] },
    );
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/kingmaker-bestiary\/the-stag-lord/);
  });
});
