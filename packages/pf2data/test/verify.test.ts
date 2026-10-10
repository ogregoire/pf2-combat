import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Manifest } from "@pf2/schema";
import { normalizeCreature } from "../src/normalize/creature.js";
import { buildIndexes } from "../src/stages/index.js";
import {
  verifyDataset,
  verifyI18n,
  verifyI18nMarkup,
  verifySpellsI18n,
} from "../src/stages/verify.js";

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
    actions: [],
    spells: {} as Record<string, unknown>,
    manifest: manifest(),
  };
};

const standardAction = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  slug: "stride",
  name: "Stride",
  cost: "1",
  category: "basic",
  traits: ["move"],
  description: "<p>You move up to your Speed.</p>",
  ...overrides,
});

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
      actions: [],
      spells: {},
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
      actions: [],
      spells: {},
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
      actions: [],
      spells: {},
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
    input.actions = [standardAction()];
    const result = verifyDataset(input);
    expect(result.ok).toBe(true);
  });

  it("fails when a standard action does not validate against its schema", () => {
    const input = baseInput();
    // `passive` is a creature-action cost, never a standard-action one.
    input.actions = [standardAction({ cost: "passive" })];
    const result = verifyDataset(input);
    expect(result.ok).toBe(false);
    expect(result.failures.join(" ")).toMatch(/schema: action stride/);
  });

  it("fails when an unresolved @UUID reference remains in a standard action", () => {
    const input = baseInput();
    input.actions = [
      standardAction({ description: "<p>@UUID[Compendium.pf2e.conditionitems.Item.Prone]</p>" }),
    ];
    const result = verifyDataset(input);
    expect(result.ok).toBe(false);
    expect(result.failures.join(" ")).toMatch(/links: action stride.*@UUID/);
  });

  it("fails when two standard actions share a slug -- the French overlay's key", () => {
    const input = baseInput();
    input.actions = [standardAction(), standardAction({ name: "Stride Again" })];
    const result = verifyDataset(input);
    expect(result.ok).toBe(false);
    expect(result.failures.join(" ")).toMatch(/actions: slug stride appears twice/);
  });

  it("fails when Delay or Strike is emitted as a standard action", () => {
    const input = baseInput();
    input.actions = [
      standardAction({ slug: "delay", name: "Delay", cost: "free" }),
      standardAction({ slug: "strike", name: "Strike" }),
    ];
    const result = verifyDataset(input);
    expect(result.ok).toBe(false);
    expect(result.failures.join(" ")).toMatch(/actions: delay is excluded/);
    expect(result.failures.join(" ")).toMatch(/actions: strike is excluded/);
  });
});

describe("verifyI18n", () => {
  // The overlay is keyed by ARRAY POSITION, so it is only ever safe while the
  // overlay and the creature agree position-for-position. An upstream reorder
  // or a dropped item must be a loud failure here, never a silently
  // mistranslated Strike.
  it("fails when an overlay position's English name disagrees with the creature", () => {
    const problems = verifyI18n(
      { id: "p/c", actions: [{ name: "Rend" }], attacks: [], spellcasting: [] },
      { name: "X", publicNotes: null, actions: [{ en: "Grab", name: "Agripper", description: null }], attacks: [], spells: [] },
    );
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/Rend/);
    expect(problems[0]).toMatch(/Grab/);
  });

  it("fails when the overlay has a different number of positions than the creature", () => {
    // Creature has 2 actions, overlay has 1 -- an upstream reorder or a dropped
    // item. Index-keying is only safe while the lengths agree.
    expect(verifyI18n(
      { id: "p/c", actions: [{ name: "Rend" }, { name: "Grab" }], attacks: [], spellcasting: [] },
      { name: "X", publicNotes: null, actions: [{ en: "Rend", name: null, description: null }], attacks: [], spells: [] },
    )).toHaveLength(1);
  });

  it("passes for an aligned overlay", () => {
    expect(verifyI18n(
      { id: "p/c", actions: [{ name: "Rend" }], attacks: [{ name: "Claw" }], spellcasting: [] },
      { name: "X", publicNotes: null,
        actions: [{ en: "Rend", name: "Déchiqueter", description: null }],
        attacks: [{ en: "Claw", name: "Griffe" }], spells: [] },
    )).toEqual([]);
  });

  it("fails when an attack position's English name disagrees, naming the creature", () => {
    const problems = verifyI18n(
      { id: "kingmaker-bestiary/the-stag-lord", actions: [], attacks: [{ name: "Longsword" }], spellcasting: [] },
      { name: "Seigneur Cerf", publicNotes: null, actions: [], attacks: [{ en: "Composite Longbow", name: "Arc long composite" }], spells: [] },
    );
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/kingmaker-bestiary\/the-stag-lord/);
  });

  it("checks spells FLATTENED across entries, position for position", () => {
    const creature = {
      id: "p/c",
      actions: [],
      attacks: [],
      spellcasting: [
        { spells: [{ name: "Fireball" }] },
        { spells: [{ name: "Shield" }, { name: "Shield" }] },
      ],
    };
    const overlay = (names: string[]) => ({
      name: "X",
      publicNotes: null,
      actions: [],
      attacks: [],
      spells: names.map((en) => ({ en, name: null })),
    });
    expect(verifyI18n(creature, overlay(["Fireball", "Shield", "Shield"]))).toEqual([]);

    const swapped = verifyI18n(creature, overlay(["Shield", "Fireball", "Shield"]));
    expect(swapped).toHaveLength(2);
    expect(swapped[0]).toMatch(/spells\[0\] is "Fireball"/);

    // A prepared spell listed at two ranks is two rows; losing one is a
    // length mismatch, not a quietly shifted translation.
    expect(verifyI18n(creature, overlay(["Fireball", "Shield"]))[0]).toMatch(
      /overlay has 2 spells but the creature has 3/,
    );
  });
});

describe("unresolved Foundry markup in French output", () => {
  // Babele ships RAW text. The English side has zero @UUID and zero @Localize
  // because normalizeCreature resolves both; the French side must match, or
  // the GM reads the marker literally.
  it("verifyI18n reports an unresolved @UUID in an overlay", () => {
    const problems = verifyI18n(
      { id: "p/c", actions: [{ name: "Rend" }], attacks: [], spellcasting: [] },
      {
        name: "X",
        publicNotes: null,
        actions: [{
          en: "Rend",
          name: "Déchiqueter",
          description: "<p>Voir @UUID[Compendium.pf2e.actionspf2e.Item.BlAOM2X92SI6HMtJ]{Cherchez}.</p>",
        }],
        attacks: [],
        spells: [],
      },
    );
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/@UUID/);
    expect(problems[0]).toMatch(/p\/c/);
  });

  it("verifyI18n reports an unresolved @Localize in an overlay", () => {
    const problems = verifyI18n(
      { id: "p/c", actions: [], attacks: [], spellcasting: [] },
      {
        name: "X",
        publicNotes: "@Localize[PF2E.NPC.Abilities.Glossary.Grab]",
        actions: [],
        attacks: [],
        spells: [],
      },
    );
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/@Localize/);
  });

  it("verifyI18nMarkup covers the reference overlays too", () => {
    expect(
      verifyI18nMarkup("i18n/fr/glossary.json", {
        grab: { name: "Agrippement", description: "<p>@UUID[Compendium.pf2e.x.Item.y]{z}</p>" },
      }),
    ).toHaveLength(1);
    expect(
      verifyI18nMarkup("i18n/fr/conditions.json", {
        frightened: { name: "Effrayé", description: "<p>propre</p>" },
      }),
    ).toEqual([]);
  });

  it("leaves @Check, @Damage and @Template alone -- the English dataset carries them too", () => {
    expect(
      verifyI18nMarkup("i18n/fr/glossary.json", {
        x: { name: "X", description: "@Check[reflex|dc:20] @Damage[2d6] @Template[burst]" },
      }),
    ).toEqual([]);
  });

  it("catches a marker family nobody has ever seen, not just the ones we know", () => {
    // Deliberately INVENTED. `@Compendium` would not pin this property: by the
    // time the allow-list existed, @Compendium was already a known family, so
    // a hand-written deny-list naming it would pass too. The property under
    // test is that ANY family the English dataset does not carry is rejected,
    // and only an unknown name can express that.
    const problems = verifyI18nMarkup("i18n/fr/creatures/p/c.json", {
      description: "<p>@Frobnicate[pf2e.spells-srd.abc]{Machin}</p>",
    });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/@Frobnicate/);
  });

  it("catches a bare @[ , which has no family name at all", () => {
    // One real occurrence: pathfinder-npc-core/harbormaster carries
    // `@[[/act balance]]{Garder l'équilibre}` -- a stray `@` in front of an
    // otherwise ordinary enricher. `/@([A-Za-z]+)\[/` needs at least one
    // letter, so it sailed past both checks.
    const problems = verifyI18nMarkup("i18n/fr/creatures/p/c.json", {
      description: "<p>un test pour @[[/act balance]]{Garder l'équilibre}</p>",
    });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/@\[/);
  });

  it("leaves an ordinary [[/act ...]] enricher alone -- English carries 416 of them", () => {
    expect(
      verifyI18nMarkup("x", { d: "<p>pour [[/act balance]]{Garder l'équilibre}</p>" }),
    ).toEqual([]);
  });
});

describe("verifyI18nMarkup catches a reference with no @-prefix", () => {
  it("flags bracket text that is a compendium reference minus its @", () => {
    const problems = verifyI18nMarkup("i18n/fr/glossary.json", {
      x: { description: "elle est [pf2e.conditionitems.4D2KBtexWXa6oUMR]{Drainée 1}" },
    });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/compendium reference/i);
  });

  it("does not flag @Check, @Damage or @Template brackets", () => {
    expect(
      verifyI18nMarkup("x", { d: "@Check[reflex|dc:20] @Damage[2d6] @Template[emanation|distance:500]" }),
    ).toEqual([]);
  });
});

describe("verifyDataset: spell details", () => {
  const caster = {
    ...stagLord,
    spellcasting: [
      {
        name: "Arcane Innate Spells",
        tradition: "arcane",
        preparation: "innate",
        dc: 20,
        attack: 12,
        slots: [],
        focusPoints: null,
        spells: [
          {
            name: "Fireball (At Will)",
            slug: "fireball",
            rank: 3,
            cost: "2",
            cantrip: false,
            frequency: "at-will" as const,
            uses: null,
            prepared: 0,
          },
        ],
      },
    ],
  };
  const fireball = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
    slug: "fireball",
    name: "Fireball",
    rank: 3,
    cantrip: false,
    traits: ["fire"],
    traditions: ["arcane"],
    cost: "2",
    range: "500 feet",
    area: { type: "burst", value: 20 },
    targets: null,
    defense: { save: "reflex", basic: true },
    duration: null,
    sustained: false,
    description: "<p>@Damage[6d6[fire]] in a @Template[burst|distance:20].</p>",
    ...overrides,
  });
  const input = (spells: Record<string, unknown>) => {
    const build = buildIndexes([caster]);
    return { ...baseInput(), creatures: [caster], books: build.books, indexes: build.indexes, spells };
  };

  it("passes when every row's slug has its details file", () => {
    const result = verifyDataset(input({ fireball: fireball() }));
    expect(result.failures).toEqual([]);
  });

  it("fails when a row's slug has no details file", () => {
    const result = verifyDataset(input({}));
    expect(result.failures.join(" ")).toMatch(/"Fireball \(At Will\)" has slug "fireball" but no spells\/fireball.json/);
  });

  it("fails on a details file no creature references", () => {
    const result = verifyDataset(input({ fireball: fireball(), orphan: fireball({ slug: "orphan" }) }));
    expect(result.failures).toEqual(["spells: spells/orphan.json is referenced by no creature"]);
  });

  it("fails when a file's name and its slug disagree", () => {
    const result = verifyDataset(input({ fireball: fireball(), other: fireball() }));
    expect(result.failures.join(" ")).toMatch(/spells\/other.json carries slug "fireball"/);
  });

  it("fails on a details file that does not validate", () => {
    const result = verifyDataset(input({ fireball: fireball({ defense: { save: "ac", basic: false } }) }));
    expect(result.failures.join(" ")).toMatch(/schema: spell fireball/);
  });

  it("fails on unresolved markup in English spell text, beyond @UUID and @Localize", () => {
    const result = verifyDataset(input({ fireball: fireball({ description: "<p>@Embed[x]</p>" }) }));
    expect(result.failures).toEqual(["links: spell fireball contains an unresolved @Embed reference"]);
  });
});

describe("verifySpellsI18n", () => {
  const fr = { name: "Boule de feu", description: null, range: "150 mètres", targets: null, duration: null };

  it("passes for a well-formed overlay of an English slug", () => {
    expect(verifySpellsI18n(new Set(["fireball"]), { fireball: fr })).toEqual([]);
  });

  it("fails on an overlay for a slug with no English details", () => {
    expect(verifySpellsI18n(new Set(), { fireball: fr })).toEqual([
      'i18n: i18n/fr/spells/fireball.json translates "fireball", which has no spells/fireball.json',
    ]);
  });

  it("fails on an invalid overlay and on unresolved markup", () => {
    expect(verifySpellsI18n(new Set(["a"]), { a: { name: "A" } }).join(" ")).toMatch(/is invalid/);
    expect(
      verifySpellsI18n(new Set(["a"]), { a: { ...fr, description: "@UUID[Compendium.pf2e.x.Item.y]" } }),
    ).toEqual(["i18n: i18n/fr/spells/a.json contains an unresolved @UUID reference"]);
  });
});
