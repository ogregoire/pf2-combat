import { describe, expect, it, beforeAll } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildCreatureI18n,
  buildIndexI18n,
  buildConditionsI18n,
  buildGlossaryI18n,
  buildTraitsI18n,
} from "../src/stages/i18n.js";
import { loadBabele, type BabeleTable } from "../src/stages/babele.js";
import { buildTraits, scanTraits } from "../src/stages/reference.js";

/**
 * Fixtures build a REAL `BabeleTable` via `loadBabele` against temp files,
 * rather than hand-rolling an object that merely mimics the shape. The
 * whole point of this suite is that `buildCreatureI18n` goes through
 * `table.lookup(kind, ownPack, name)` — own-pack-first, kind-scoped — not a
 * flat name lookup, so the fixtures need the real pack/kind machinery to
 * catch a regression to `.get`.
 */
function makeBabeleTable(files: Record<string, unknown>): BabeleTable {
  const dir = mkdtempSync(join(tmpdir(), "i18n-fixture-"));
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(join(dir, name), JSON.stringify(content));
  }
  const table = loadBabele(dir);
  rmSync(dir, { recursive: true, force: true });
  return table;
}

describe("buildCreatureI18n", () => {
  describe("alignment by array position", () => {
    // Two attacks BOTH named "Dagger" (a melee and a thrown one) with
    // different foundry ids — 156 real creatures look like this. A
    // name-keyed lookup would collapse them onto the same translation;
    // only aligning by array index keeps them distinct.
    let out: NonNullable<ReturnType<typeof buildCreatureI18n>>;

    beforeAll(() => {
      const table = makeBabeleTable({
        "pf2e.pathfinder-bestiary.json": {
          entries: {
            "Thorn River Bandit": {
              name: "Bandit de la rivière aux Épines",
              items: {
                "id-melee": { name: "Dague" },
                "id-thrown": { name: "Dague de jet" },
              },
            },
          },
        },
      });

      out = buildCreatureI18n({
        creatureName: "Thorn River Bandit",
        ownPack: "pathfinder-bestiary",
        actions: [],
        attacks: [
          { name: "Dagger", foundryId: "id-melee" },
          { name: "Dagger", foundryId: "id-thrown" },
        ],
        table,
        lang: {},
      })!;
    });

    it("aligns item translations to array position, not name", () => {
      expect(out.attacks.map((a) => a.name)).toEqual(["Dague", "Dague de jet"]);
    });

    it("records the English name at each position, so verify can catch drift", () => {
      expect(out.attacks[0]!.en).toBe("Dagger");
      expect(out.attacks[1]!.en).toBe("Dagger");
    });
  });

  it("returns null for a creature with no French entry", () => {
    // 30 real creatures look like this.
    const table = makeBabeleTable({});
    expect(
      buildCreatureI18n({
        creatureName: "Manticore",
        ownPack: "pathfinder-bestiary",
        actions: [],
        attacks: [],
        table,
        lang: {},
      }),
    ).toBeNull();
  });

  it("resolves through the table's own-pack-first lookup, not a flat name map", () => {
    // Shambler is "Tertre errant" in Kingmaker and "Grand tertre" in
    // Bestiary 1. A flat `table.get(name)` cannot tell these apart and
    // silently returns whichever pack happened to load first — which is
    // the bug Task 3's own-pack-first, kind-scoped `lookup` exists to
    // prevent.
    const table = makeBabeleTable({
      "pf2e.kingmaker-bestiary.json": {
        entries: { Shambler: { name: "Tertre errant" } },
      },
      "pf2e.pathfinder-bestiary.json": {
        entries: { Shambler: { name: "Grand tertre" } },
      },
    });

    expect(
      buildCreatureI18n({
        creatureName: "Shambler",
        ownPack: "kingmaker-bestiary",
        actions: [],
        attacks: [],
        table,
        lang: {},
      })!.name,
    ).toBe("Tertre errant");

    expect(
      buildCreatureI18n({
        creatureName: "Shambler",
        ownPack: "pathfinder-bestiary",
        actions: [],
        attacks: [],
        table,
        lang: {},
      })!.name,
    ).toBe("Grand tertre");
  });

  describe("missing item translations", () => {
    let out: NonNullable<ReturnType<typeof buildCreatureI18n>>;

    beforeAll(() => {
      const table = makeBabeleTable({
        "pf2e.pathfinder-bestiary.json": {
          entries: {
            "Skeleton Guard": {
              name: "Garde squelette",
              items: {}, // no translation for this action's item id
            },
          },
        },
      });

      out = buildCreatureI18n({
        creatureName: "Skeleton Guard",
        ownPack: "pathfinder-bestiary",
        actions: [{ name: "Grab", foundryId: "missing-id" }],
        attacks: [],
        table,
        lang: {},
      })!;
    });

    it("uses null, never the English text, for an item the table does not cover", () => {
      expect(out.actions[0]!.name).toBeNull();
      expect(out.actions[0]!.description).toBeNull();
    });

    it("still records the English name at that position", () => {
      expect(out.actions[0]!.en).toBe("Grab");
    });
  });

  describe("field mapping", () => {
    it("maps the entry's own name and description fields to name/publicNotes", () => {
      const table = makeBabeleTable({
        "pf2e.pathfinder-bestiary.json": {
          entries: {
            Ankou: {
              name: "Ankou FR",
              description: "Notes publiques FR",
              items: {
                "action-id": { name: "Effroi FR", description: "Description FR" },
              },
            },
          },
        },
      });

      const out = buildCreatureI18n({
        creatureName: "Ankou",
        ownPack: "pathfinder-bestiary",
        actions: [{ name: "Dread", foundryId: "action-id" }],
        attacks: [],
        table,
        lang: {},
      })!;

      expect(out.name).toBe("Ankou FR");
      expect(out.publicNotes).toBe("Notes publiques FR");
      expect(out.actions[0]!.name).toBe("Effroi FR");
      expect(out.actions[0]!.description).toBe("Description FR");
    });

    it("uses null for publicNotes when the entry has no description field", () => {
      const table = makeBabeleTable({
        "pf2e.pathfinder-bestiary.json": {
          entries: { Ankou: { name: "Ankou FR" } },
        },
      });

      const out = buildCreatureI18n({
        creatureName: "Ankou",
        ownPack: "pathfinder-bestiary",
        actions: [],
        attacks: [],
        table,
        lang: {},
      })!;

      expect(out.publicNotes).toBeNull();
    });
  });
});

describe("buildIndexI18n", () => {
  it("emits an id -> french name map for the search index", () => {
    const table = makeBabeleTable({
      "pf2e.kingmaker-bestiary.json": {
        entries: { "The Stag Lord": { name: "Seigneur Cerf" } },
      },
    });

    expect(
      buildIndexI18n(
        [{ id: "kingmaker-bestiary/the-stag-lord", name: "The Stag Lord" }],
        table,
      ),
    ).toEqual({ "kingmaker-bestiary/the-stag-lord": "Seigneur Cerf" });
  });

  it("takes each creature's own pack's translation", () => {
    // Shambler: "Tertre errant" in Kingmaker, "Grand tertre" in Bestiary 1.
    // A flat lookup returns whichever pack loaded first; deriving `ownPack`
    // from the id's own prefix is what keeps the two apart.
    const table = makeBabeleTable({
      "pf2e.kingmaker-bestiary.json": {
        entries: { Shambler: { name: "Tertre errant" } },
      },
      "pf2e.pathfinder-bestiary.json": {
        entries: { Shambler: { name: "Grand tertre" } },
      },
    });

    expect(
      buildIndexI18n(
        [
          { id: "kingmaker-bestiary/shambler", name: "Shambler" },
          { id: "pathfinder-bestiary/shambler", name: "Shambler" },
        ],
        table,
      ),
    ).toEqual({
      "kingmaker-bestiary/shambler": "Tertre errant",
      "pathfinder-bestiary/shambler": "Grand tertre",
    });
  });

  it("omits an untranslated creature rather than echoing its English name", () => {
    // 30 real creatures have no French entry at all.
    const table = makeBabeleTable({});
    expect(
      buildIndexI18n([{ id: "x/manticore", name: "Manticore" }], table),
    ).toEqual({});
  });
});

describe("buildConditionsI18n and buildGlossaryI18n", () => {
  it("carries the description as well as the name, keyed by our slug", () => {
    // `useTraitGlossary` builds a slug -> {name, description} map and
    // renders the description as hover text. A name-only overlay leaves
    // every condition/glossary tooltip in English.
    const table = makeBabeleTable({
      "pf2e.conditionitems.json": {
        entries: {
          Frightened: {
            name: "Effrayé",
            description: "<p>Vous êtes paralysé…</p>",
          },
        },
      },
    });

    expect(
      buildConditionsI18n([{ slug: "frightened", name: "Frightened" }], table, {}),
    ).toEqual({
      frightened: { name: "Effrayé", description: "<p>Vous êtes paralysé…</p>" },
    });
  });

  it("uses null, not the English text, for an entry translated by name only", () => {
    // `Grab` really is name-only in the module -- "Agrippement", no body.
    const table = makeBabeleTable({
      "pf2e.bestiary-ability-glossary-srd.json": {
        entries: { Grab: { name: "Agrippement" } },
      },
    });

    expect(buildGlossaryI18n([{ slug: "grab", name: "Grab" }], table, {})).toEqual({
      grab: { name: "Agrippement", description: null },
    });
  });

  it("looks conditions up under the condition kind", () => {
    const table = makeBabeleTable({
      "pf2e.conditionitems.json": {
        entries: { Frightened: { name: "Effrayé" } },
      },
    });

    expect(
      buildConditionsI18n([{ slug: "frightened", name: "Frightened" }], table, {}),
    ).toEqual({ frightened: { name: "Effrayé", description: null } });
  });

  it("looks glossary entries up under the glossary kind, not the condition kind", () => {
    // `Guard` is "Garde" the creature and "Se défendre" the action; kinds
    // must never be pooled. Here the same English name, "Grab", is used by
    // both a condition-kind file and a glossary-kind file with different
    // French text -- each builder must only ever see its own kind.
    const table = makeBabeleTable({
      "pf2e.conditionitems.json": {
        entries: { Grab: { name: "Condition FR (wrong kind)" } },
      },
      "pf2e.bestiary-ability-glossary-srd.json": {
        entries: { Grab: { name: "Saisie" } },
      },
    });

    expect(buildGlossaryI18n([{ slug: "grab", name: "Grab" }], table, {})).toEqual({
      grab: { name: "Saisie", description: null },
    });
    expect(
      buildConditionsI18n([{ slug: "grab", name: "Grab" }], table, {}),
    ).toEqual({ grab: { name: "Condition FR (wrong kind)", description: null } });
  });

  it("reconciles a glossary entry across both ability-glossary files", () => {
    // The monster-ability glossary ships as two Babele files
    // (bestiary-ability-glossary-srd, bestiary-family-ability-glossary).
    // Neither is more "own" than the other, so both must be searched.
    const table = makeBabeleTable({
      "pf2e.bestiary-family-ability-glossary.json": {
        entries: { Rend: { name: "Déchirure" } },
      },
    });

    expect(buildGlossaryI18n([{ slug: "rend", name: "Rend" }], table, {})).toEqual({
      rend: { name: "Déchirure", description: null },
    });
  });

  it("omits an untranslated entry rather than echoing its English name", () => {
    const table = makeBabeleTable({});
    expect(
      buildConditionsI18n([{ slug: "frightened", name: "Frightened" }], table, {}),
    ).toEqual({});
    expect(buildGlossaryI18n([{ slug: "grab", name: "Grab" }], table, {})).toEqual(
      {},
    );
  });
});

describe("French buildTraits", () => {
  it("reuses buildTraits against the French lang table, so slugs stay identical", () => {
    const en = buildTraits({
      "PF2E.TraitDescriptionAgile": "The multiple attack penalty…",
      "PF2E.TraitAgile": "Agile",
    });
    const fr = buildTraits({
      "PF2E.TraitDescriptionAgile": "La pénalité d'attaques multiples…",
      "PF2E.TraitAgile": "Agile",
    });
    expect(fr.map((t) => t.slug)).toEqual(en.map((t) => t.slug));
  });
});

describe("buildTraitsI18n", () => {
  // Real French shapes, taken from the module: `agile` has both keys,
  // `class` has a description but no `PF2E.TraitClass` display name, and
  // `gnoll` has neither (a remaster rename -- the French module calls it
  // `kholo` now).
  const frLang = {
    "PF2E.TraitDescriptionAgile": "La pénalité d'attaques multiples…",
    "PF2E.TraitAgile": "Agile",
    "PF2E.TraitDescriptionClass": "Description française de la classe…",
    "PF2E.TraitDescriptionUnshipped": "Un trait que nous ne publions pas.",
    "PF2E.TraitUnshipped": "Non publié",
  };

  it("keys the overlay by our slug and carries the French description", () => {
    expect(buildTraitsI18n(["agile"], scanTraits(frLang))).toEqual({
      agile: { name: "Agile", description: "La pénalité d'attaques multiples…" },
    });
  });

  it("uses null, never a title-cased English slug, when the French name is missing", () => {
    // buildTraits substitutes `titleCaseFromSlug` for a missing display name.
    // That is English-derived text; in the French overlay it would hide the
    // gap from `report`. 13 of our 426 slugs are in this state.
    const out = buildTraitsI18n(["class"], scanTraits(frLang));
    expect(out["class"]).toEqual({
      name: null,
      description: "Description française de la classe…",
    });
    expect(JSON.stringify(out)).not.toContain("Class");
  });

  it("omits a trait the French lang table has no description for", () => {
    expect(buildTraitsI18n(["gnoll"], scanTraits(frLang))).toEqual({});
  });

  it("ignores French traits we do not ship", () => {
    // The French lang table carries 535 trait descriptions to our 426.
    expect(Object.keys(buildTraitsI18n(["agile"], scanTraits(frLang)))).toEqual([
      "agile",
    ]);
  });
});

/**
 * Babele ships RAW Foundry text: `@UUID[...]{label}` cross-references and
 * `@Localize[KEY]` glossary includes. The English pipeline strips both
 * (`resolveLocalize` then `resolveLinks`), which is why `data/creatures/**`
 * contains zero of either. The French side must match, or the GM reads
 * `@UUID[Compendium.pf2e.actionspf2e.Item.BlAOM2X92SI6HMtJ]{Cherchez}`
 * literally -- which is what the first generated overlay did, in 76% of
 * translated creatures.
 */
describe("French markup resolution", () => {
  // A real shape: the glossary include resolves to French text that ITSELF
  // carries a @UUID reference, so the order matters -- localize first, links
  // second, exactly as normalizeCreature does it.
  const frLang = {
    "PF2E.NPC.Abilities.Glossary.Grab": "<p>Agrippement: la cible est @UUID[Compendium.pf2e.conditionitems.Item.Grabbed]{agrippée}.</p>",
  };

  const table = makeBabeleTable({
    "pf2e.pathfinder-bestiary.json": {
      entries: {
        Manticore: {
          name: "Manticore",
          description: "<p>Voir @UUID[Compendium.pf2e.actionspf2e.Item.BlAOM2X92SI6HMtJ]{Cherchez}.</p>",
          items: {
            "id-grab": {
              name: "Agrippement",
              description: "@Localize[PF2E.NPC.Abilities.Glossary.Grab]",
            },
          },
        },
      },
    },
    "pf2e.conditionitems.json": {
      entries: {
        Frightened: {
          name: "Effrayé",
          description: "<p>Voir @UUID[Compendium.pf2e.conditionitems.Item.Off-Guard]{pris au dépourvu}.</p>",
        },
      },
    },
    "pf2e.bestiary-ability-glossary-srd.json": {
      entries: {
        Grab: {
          name: "Agrippement",
          description: "@Localize[PF2E.NPC.Abilities.Glossary.Grab]",
        },
      },
    },
  });

  const noMarkers = (value: unknown): void => {
    const json = JSON.stringify(value);
    expect(json).not.toContain("@UUID[");
    expect(json).not.toContain("@Localize[");
  };

  it("resolves publicNotes and action descriptions, keeping the FRENCH label", () => {
    const out = buildCreatureI18n({
      creatureName: "Manticore",
      ownPack: "pathfinder-bestiary",
      actions: [{ name: "Grab", foundryId: "id-grab" }],
      attacks: [],
      table,
      lang: frLang,
    })!;

    noMarkers(out);
    expect(out.publicNotes).toBe("<p>Voir Cherchez.</p>");
    // @Localize expanded from the FRENCH lang table, and the @UUID inside
    // that expansion resolved afterwards.
    expect(out.actions[0]!.description).toBe(
      "<p>Agrippement: la cible est agrippée.</p>",
    );
  });

  it("resolves condition and glossary descriptions", () => {
    const conditions = buildConditionsI18n(
      [{ slug: "frightened", name: "Frightened" }],
      table,
      frLang,
    );
    noMarkers(conditions);
    expect(conditions["frightened"]!.description).toBe(
      "<p>Voir pris au dépourvu.</p>",
    );

    const glossary = buildGlossaryI18n([{ slug: "grab", name: "Grab" }], table, frLang);
    noMarkers(glossary);
    expect(glossary["grab"]!.description).toBe(
      "<p>Agrippement: la cible est agrippée.</p>",
    );
  });

  it("resolves @Localize against the French table, never the English one", () => {
    // The same key exists in both lang files. Resolving against English would
    // drop English prose into otherwise-French text -- worse than leaving the
    // marker, because it looks correct.
    const enLang = {
      "PF2E.NPC.Abilities.Glossary.Grab": "<p>The target is grabbed.</p>",
    };
    const out = buildCreatureI18n({
      creatureName: "Manticore",
      ownPack: "pathfinder-bestiary",
      actions: [{ name: "Grab", foundryId: "id-grab" }],
      attacks: [],
      table,
      lang: frLang,
    })!;
    expect(out.actions[0]!.description).not.toContain("grabbed");
    expect(enLang["PF2E.NPC.Abilities.Glossary.Grab"]).toContain("grabbed"); // the trap really is set
  });
});
