import { describe, expect, it, beforeAll } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildCreatureI18n } from "../src/stages/i18n.js";
import { loadBabele, type BabeleTable } from "../src/stages/babele.js";

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
