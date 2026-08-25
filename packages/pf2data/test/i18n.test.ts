import { describe, expect, it, beforeAll } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildCreatureI18n,
  buildIndexI18n,
  buildConditionsI18n,
  buildGlossaryI18n,
} from "../src/stages/i18n.js";
import { loadBabele, type BabeleTable } from "../src/stages/babele.js";
import { buildTraits } from "../src/stages/reference.js";

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
      })!.name,
    ).toBe("Tertre errant");

    expect(
      buildCreatureI18n({
        creatureName: "Shambler",
        ownPack: "pathfinder-bestiary",
        actions: [],
        attacks: [],
        table,
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
  it("looks conditions up under the condition kind", () => {
    const table = makeBabeleTable({
      "pf2e.conditionitems.json": {
        entries: { Frightened: { name: "Effrayé" } },
      },
    });

    expect(buildConditionsI18n(["Frightened"], table)).toEqual({
      Frightened: "Effrayé",
    });
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

    expect(buildGlossaryI18n(["Grab"], table)).toEqual({ Grab: "Saisie" });
    expect(buildConditionsI18n(["Grab"], table)).toEqual({
      Grab: "Condition FR (wrong kind)",
    });
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

    expect(buildGlossaryI18n(["Rend"], table)).toEqual({ Rend: "Déchirure" });
  });

  it("omits an untranslated entry rather than echoing its English name", () => {
    const table = makeBabeleTable({});
    expect(buildConditionsI18n(["Frightened"], table)).toEqual({});
    expect(buildGlossaryI18n(["Grab"], table)).toEqual({});
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
