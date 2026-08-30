import { describe, expect, it, beforeAll } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
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
import { loadArchive } from "../src/stages/archive.js";
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

/** Same rationale as `makeBabeleTable`: a REAL archive table via `loadArchive`
 * against temp `archive/<pack>/<foundryId>.htm` files, not a hand-rolled
 * `Map` that merely mimics the shape -- Task 17. */
function makeArchiveTable(files: Record<string, Record<string, string>>) {
  const dir = mkdtempSync(join(tmpdir(), "i18n-archive-fixture-"));
  const archiveDir = join(dir, "archive");
  mkdirSync(archiveDir, { recursive: true });
  for (const [pack, records] of Object.entries(files)) {
    const packDir = join(archiveDir, pack);
    mkdirSync(packDir, { recursive: true });
    for (const [foundryId, content] of Object.entries(records)) {
      writeFileSync(join(packDir, `${foundryId}.htm`), content);
    }
  }
  const table = loadArchive(archiveDir);
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
        creatureFoundryId: "thorn-river-bandit-id",
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
        creatureFoundryId: "manticore-id",
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
        creatureFoundryId: "shambler-kingmaker-id",
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
        creatureFoundryId: "shambler-pathfinder-id",
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
        creatureFoundryId: "skeleton-guard-id",
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
        creatureFoundryId: "ankou-id",
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
        creatureFoundryId: "ankou-id-2",
        ownPack: "pathfinder-bestiary",
        actions: [],
        attacks: [],
        table,
        lang: {},
      })!;

      expect(out.publicNotes).toBeNull();
    });
  });

  // Task 1 (French follow-ups): the Déclencheur/Conditions paragraphs live
  // inside the SAME raw item description Babele already carries -- no new
  // field, no new source. Fixture is the real forest-troll shape (trimmed).
  describe("trigger and requirements extraction", () => {
    it("extracts a French trigger from the item's Déclencheur paragraph", () => {
      const table = makeBabeleTable({
        "pf2e.pathfinder-monster-core.json": {
          entries: {
            "Forest Troll": {
              name: "Troll des forêts",
              items: {
                "id-flailing": {
                  name: "Lutte furieuse",
                  description:
                    "<p><strong>Déclencheur</strong> Le troll des forêts subit des dégâts d'électricité ou de feu</p>\n<hr />\n<p><strong>Effet</strong> Le troll effectue une Frappe.</p>",
                },
              },
            },
          },
        },
      });

      const out = buildCreatureI18n({
        creatureName: "Forest Troll",
        creatureFoundryId: "forest-troll-id",
        ownPack: "pathfinder-monster-core",
        actions: [{ name: "Furious Flailing", foundryId: "id-flailing" }],
        attacks: [],
        table,
        lang: {},
      })!;

      expect(out.actions[0]!.trigger).toBe(
        "Le troll des forêts subit des dégâts d'électricité ou de feu",
      );
      expect(out.actions[0]!.requirements).toBeNull();
    });

    it("extracts French requirements from the item's Conditions paragraph -- REQUIREMENTS, not status conditions", () => {
      const table = makeBabeleTable({
        "pf2e.pathfinder-bestiary.json": {
          entries: {
            "Grand Tertre": {
              name: "Grand tertre",
              items: {
                "id-mound": {
                  description:
                    "<p><strong>Conditions</strong> Le grand tertre est sous sa forme de monticule</p>",
                },
              },
            },
          },
        },
      });

      const out = buildCreatureI18n({
        creatureName: "Grand Tertre",
        creatureFoundryId: "shambler-id",
        ownPack: "pathfinder-bestiary",
        actions: [{ name: "Mound Form", foundryId: "id-mound" }],
        attacks: [],
        table,
        lang: {},
      })!;

      expect(out.actions[0]!.requirements).toBe("Le grand tertre est sous sa forme de monticule");
      expect(out.actions[0]!.trigger).toBeNull();
    });

    it("resolves @UUID references inside the extracted trigger, same as the description", () => {
      const table = makeBabeleTable({
        "pf2e.pathfinder-bestiary.json": {
          entries: {
            Ankou: {
              name: "Ankou FR",
              items: {
                "action-id": {
                  description:
                    "<p><strong>Déclencheur</strong> La cible est @UUID[Compendium.pf2e.conditionitems.Item.Off-Guard]{Pris au dépourvu}</p>",
                },
              },
            },
          },
        },
      });

      const out = buildCreatureI18n({
        creatureName: "Ankou",
        creatureFoundryId: "ankou-id",
        ownPack: "pathfinder-bestiary",
        actions: [{ name: "Dread", foundryId: "action-id" }],
        attacks: [],
        table,
        lang: {},
      })!;

      expect(out.actions[0]!.trigger).toBe("La cible est Pris au dépourvu");
    });

    it("uses null, never the English text, when the item has no such paragraph", () => {
      const table = makeBabeleTable({
        "pf2e.pathfinder-bestiary.json": {
          entries: {
            Ankou: {
              name: "Ankou FR",
              items: {
                "action-id": { description: "<p>Juste une description ordinaire.</p>" },
              },
            },
          },
        },
      });

      const out = buildCreatureI18n({
        creatureName: "Ankou",
        creatureFoundryId: "ankou-id-3",
        ownPack: "pathfinder-bestiary",
        actions: [{ name: "Dread", foundryId: "action-id" }],
        attacks: [],
        table,
        lang: {},
      })!;

      expect(out.actions[0]!.trigger).toBeNull();
      expect(out.actions[0]!.requirements).toBeNull();
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
        [
          {
            id: "kingmaker-bestiary/the-stag-lord",
            name: "The Stag Lord",
            foundryId: "stag-lord-id",
          },
        ],
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
          {
            id: "kingmaker-bestiary/shambler",
            name: "Shambler",
            foundryId: "shambler-kingmaker-id",
          },
          {
            id: "pathfinder-bestiary/shambler",
            name: "Shambler",
            foundryId: "shambler-pathfinder-id",
          },
        ],
        table,
      ),
    ).toEqual({
      "kingmaker-bestiary/shambler": "Tertre errant",
      "pathfinder-bestiary/shambler": "Grand tertre",
    });
  });

  it("omits a creature neither Babele nor the archive covers, rather than echoing its English name", () => {
    const table = makeBabeleTable({});
    expect(
      buildIndexI18n(
        [{ id: "x/manticore", name: "Manticore", foundryId: "manticore-id" }],
        table,
      ),
    ).toEqual({});
  });
});

/**
 * Task 17: 30 real creatures had no Babele entry at all. The fan module
 * carries all 30 in its own retired `archive/` directory, joinable by
 * `Creature.foundryId` -- consulted ONLY on a Babele miss, never ahead of
 * it, because the archive is old data and Babele is the live, maintained
 * one.
 */
describe("archive fallback", () => {
  it("never overrides a live Babele translation", () => {
    // Shambler IS in the archive fixture below too, under the same foundry
    // id, but with different (wrong) text -- if the archive ever won this
    // race the assertion below would catch it immediately.
    const babele = makeBabeleTable({
      "pf2e.kingmaker-bestiary.json": {
        entries: { Shambler: { name: "Tertre errant" } },
      },
    });
    const archive = makeArchiveTable({
      "kingmaker-bestiary": {
        "shambler-foundry-id": "Name: Shambler\nNom: WRONG (archive must not win)\n",
      },
    });

    const out = buildCreatureI18n({
      creatureName: "Shambler",
      creatureFoundryId: "shambler-foundry-id",
      ownPack: "kingmaker-bestiary",
      actions: [],
      attacks: [],
      table: babele,
      lang: {},
      archive,
    })!;

    expect(out.name).toBe("Tertre errant");
  });

  it("fills a creature Babele does not cover", () => {
    const babele = makeBabeleTable({});
    const archive = makeArchiveTable({
      "pathfinder-bestiary": {
        "manticore-foundry-id":
          "Name: Manticore\nNom: Manticore\nÉtat: officielle\n\n" +
          "-- Desc (en) --\n<p>A manticore stalks its prey.</p>\n" +
          "-- Desc (fr) --\n<p>La manticore traque sa proie.</p>\n-- End desc ---\n\n" +
          "ID: id-tail\nName: Tail Spikes\nNom: Piquants de queue\n" +
          "-- Desc (en) --\n<p>@UUID[Compendium.pf2e.actionspf2e.Item.abc]{Strike}.</p>\n" +
          "-- Desc (fr) --\n<p>@UUID[Compendium.pf2e.actionspf2e.Item.abc]{Frappe}.</p>\n-- End desc ---\n",
      },
    });

    const out = buildCreatureI18n({
      creatureName: "Manticore",
      creatureFoundryId: "manticore-foundry-id",
      ownPack: "pathfinder-bestiary",
      actions: [{ name: "Tail Spikes", foundryId: "id-tail" }],
      attacks: [],
      table: babele,
      lang: {},
      archive,
    })!;

    expect(out.name).toBe("Manticore");
    expect(out.publicNotes).toBe("<p>La manticore traque sa proie.</p>");
    // Archive text carries the same @UUID markers Babele text does, and must
    // go through the SAME `resolveFrench` pass -- the French label survives,
    // the marker does not.
    expect(out.actions[0]!.description).toBe("<p>Frappe.</p>");
    // The item's translated NAME, not just its description -- aligned by
    // foundry id, same as a Babele-sourced item.
    expect(out.actions[0]!.name).toBe("Piquants de queue");
    expect(JSON.stringify(out)).not.toContain("@UUID[");
  });

  it("returns null when neither Babele nor the archive covers the creature", () => {
    const babele = makeBabeleTable({});
    const archive = makeArchiveTable({});
    expect(
      buildCreatureI18n({
        creatureName: "Nobody",
        creatureFoundryId: "nobody-id",
        ownPack: "pathfinder-bestiary",
        actions: [],
        attacks: [],
        table: babele,
        lang: {},
        archive,
      }),
    ).toBeNull();
  });

  it("treats an archive record with an empty Nom: (no French name) as no translation", () => {
    // 634 of 1350 legacy records carry no body at all; a bare empty `Nom:`
    // on the creature's OWN line is the same "no translation" case, and must
    // never fall back to the English name.
    const babele = makeBabeleTable({});
    const archive = makeArchiveTable({
      "pathfinder-bestiary": { "blank-id": "Name: Blank\nNom: \n" },
    });
    expect(
      buildCreatureI18n({
        creatureName: "Blank",
        creatureFoundryId: "blank-id",
        ownPack: "pathfinder-bestiary",
        actions: [],
        attacks: [],
        table: babele,
        lang: {},
        archive,
      }),
    ).toBeNull();
  });

  // Task 2 (French follow-ups): unlike the whole-creature fallback above,
  // these creatures ARE covered by Babele -- the gap is a specific item the
  // live translation missed, and the archive fills only THAT item.
  describe("item-level archive fallback", () => {
    it("fills a null item description without touching a populated one", () => {
      // Babele wins wherever it has something; the archive is retired data.
      const babele = makeBabeleTable({
        "pf2e.pathfinder-bestiary.json": {
          entries: {
            Ogre: {
              name: "Ogre",
              items: {
                "id-babele": { description: "<p>Babele's French</p>" },
                // no entry at all for id-archive -- Babele never covered it
              },
            },
          },
        },
      });
      const archive = makeArchiveTable({
        "pathfinder-bestiary": {
          "ogre-id":
            "Name: Ogre\nNom: Ogre\nÉtat: officielle\n\n" +
            "ID: id-babele\nName: Babele Action\nNom: Babele Action FR\n" +
            "-- Desc (en) --\n<p>Archive's English (must lose)</p>\n" +
            "-- Desc (fr) --\n<p>Archive's French (must lose)</p>\n-- End desc ---\n\n" +
            "ID: id-archive\nName: Archive Action\nNom: Archive Action FR\n" +
            "-- Desc (en) --\n<p>Archive's English</p>\n" +
            "-- Desc (fr) --\n<p>Archive's French</p>\n-- End desc ---\n\n" +
            "ID: id-neither\nName: Neither Action\nNom: Neither Action FR\n",
        },
      });

      const out = buildCreatureI18n({
        creatureName: "Ogre",
        creatureFoundryId: "ogre-id",
        ownPack: "pathfinder-bestiary",
        actions: [
          { name: "Babele Action", foundryId: "id-babele" },
          { name: "Archive Action", foundryId: "id-archive" },
          { name: "Neither Action", foundryId: "id-neither" },
        ],
        attacks: [],
        table: babele,
        lang: {},
        archive,
      })!;

      expect(out.actions[0]!.description).toBe("<p>Babele's French</p>");
      expect(out.actions[1]!.description).toBe("<p>Archive's French</p>");
      // leaves a description null when neither source has it
      expect(out.actions[2]!.description).toBeNull();
    });

    it("aligns archive items by foundryId, never by position or name", () => {
      // Same reason the Babele join is id-keyed: 156 creatures carry two
      // same-named Strikes (a melee and a thrown Dagger/Hatchet/Spear).
      // Babele covers neither Dagger item here, so both fall back to the
      // archive -- each must pick up ITS OWN archive text, not the other's
      // or whichever comes first.
      const babele = makeBabeleTable({
        "pf2e.pathfinder-bestiary.json": {
          entries: { Bandit: { name: "Bandit", items: {} } },
        },
      });
      // The archive record lists the THROWN item first -- the reverse of the
      // `actions` array order below -- so that a positional (rather than
      // foundry-id) join would pick up the wrong text for both.
      const archive = makeArchiveTable({
        "pathfinder-bestiary": {
          "bandit-id":
            "Name: Bandit\nNom: Bandit\nÉtat: officielle\n\n" +
            "ID: id-thrown\nName: Dagger\nNom: Dague de jet\n" +
            "-- Desc (en) --\n<p>Thrown EN</p>\n-- Desc (fr) --\n<p>Thrown FR</p>\n-- End desc ---\n\n" +
            "ID: id-melee\nName: Dagger\nNom: Dague\n" +
            "-- Desc (en) --\n<p>Melee EN</p>\n-- Desc (fr) --\n<p>Melee FR</p>\n-- End desc ---\n",
        },
      });

      const out = buildCreatureI18n({
        creatureName: "Bandit",
        creatureFoundryId: "bandit-id",
        ownPack: "pathfinder-bestiary",
        actions: [
          { name: "Dagger", foundryId: "id-melee" },
          { name: "Dagger", foundryId: "id-thrown" },
        ],
        attacks: [],
        table: babele,
        lang: {},
        archive,
      })!;

      expect(out.actions[0]!.name).toBe("Dague");
      expect(out.actions[0]!.description).toBe("<p>Melee FR</p>");
      expect(out.actions[1]!.name).toBe("Dague de jet");
      expect(out.actions[1]!.description).toBe("<p>Thrown FR</p>");
    });

    it("resolves archive-sourced item HTML through the same French pipeline as Babele text", () => {
      const babele = makeBabeleTable({
        "pf2e.pathfinder-bestiary.json": {
          entries: { Ankou: { name: "Ankou FR", items: {} } },
        },
      });
      const archive = makeArchiveTable({
        "pathfinder-bestiary": {
          "ankou-id":
            "Name: Ankou\nNom: Ankou FR\nÉtat: officielle\n\n" +
            "ID: id-dread\nName: Dread\nNom: Effroi\n" +
            "-- Desc (en) --\n<p>@UUID[Compendium.pf2e.actionspf2e.Item.abc]{Strike}.</p>\n" +
            "-- Desc (fr) --\n<p>@UUID[Compendium.pf2e.actionspf2e.Item.abc]{Frappe}.</p>\n-- End desc ---\n",
        },
      });

      const out = buildCreatureI18n({
        creatureName: "Ankou",
        creatureFoundryId: "ankou-id",
        ownPack: "pathfinder-bestiary",
        actions: [{ name: "Dread", foundryId: "id-dread" }],
        attacks: [],
        table: babele,
        lang: {},
        archive,
      })!;

      expect(out.actions[0]!.description).toBe("<p>Frappe.</p>");
      expect(JSON.stringify(out)).not.toContain("@UUID[");
    });
  });

  describe("buildIndexI18n", () => {
    it("never overrides a live Babele translation", () => {
      const babele = makeBabeleTable({
        "pf2e.kingmaker-bestiary.json": {
          entries: { Shambler: { name: "Tertre errant" } },
        },
      });
      const archive = makeArchiveTable({
        "kingmaker-bestiary": {
          "shambler-foundry-id": "Name: Shambler\nNom: WRONG (archive must not win)\n",
        },
      });

      expect(
        buildIndexI18n(
          [{ id: "kingmaker-bestiary/shambler", name: "Shambler", foundryId: "shambler-foundry-id" }],
          babele,
          archive,
        ),
      ).toEqual({ "kingmaker-bestiary/shambler": "Tertre errant" });
    });

    it("fills the search index for a creature Babele does not cover", () => {
      const babele = makeBabeleTable({});
      const archive = makeArchiveTable({
        "pathfinder-bestiary": {
          "manticore-foundry-id": "Name: Manticore\nNom: Manticore\n",
        },
      });

      expect(
        buildIndexI18n(
          [{ id: "pathfinder-bestiary/manticore", name: "Manticore", foundryId: "manticore-foundry-id" }],
          babele,
          archive,
        ),
      ).toEqual({ "pathfinder-bestiary/manticore": "Manticore" });
    });
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
      creatureFoundryId: "manticore-markup-id",
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

  it("resolves @Localize against the table it is GIVEN, so the caller's choice decides", () => {
    // The same key exists in both lang files, with different prose. The
    // builder must honour whichever table it is handed -- if it ignored the
    // argument (a hardcoded table, or no resolution at all) both calls below
    // would come back identical, and the cli tests further down are what pin
    // that the FRENCH one is the table actually passed.
    const enLang = {
      "PF2E.NPC.Abilities.Glossary.Grab": "<p>The target is grabbed.</p>",
    };
    const build = (lang: Record<string, string>) =>
      buildCreatureI18n({
        creatureName: "Manticore",
        creatureFoundryId: "manticore-localize-id",
        ownPack: "pathfinder-bestiary",
        actions: [{ name: "Grab", foundryId: "id-grab" }],
        attacks: [],
        table,
        lang,
      })!.actions[0]!.description;

    expect(build(frLang)).toBe("<p>Agrippement: la cible est agrippée.</p>");
    expect(build(enLang)).toBe("<p>The target is grabbed.</p>");
    expect(build(frLang)).not.toBe(build(enLang));
    // ...and an empty table leaves the marker, so neither result can be an
    // artefact of the builder ignoring `lang` entirely.
    expect(build({})).toContain("@Localize[");
  });
});

describe("stray @ in front of an enricher", () => {
  // `[[/act balance]]{label}` is an ordinary Foundry enricher -- 416 of them
  // in the ENGLISH dataset, 247 in the French, and both pipelines leave them
  // for the app to render. One French entry (pathfinder-npc-core/harbormaster)
  // carries a stray `@` in front of one, which renders as a literal `@` and
  // has no meaning in any Foundry syntax. English has zero `@[`.
  const table = makeBabeleTable({
    "pf2e.pathfinder-npc-core.json": {
      entries: {
        Harbormaster: {
          name: "Capitaine du port",
          items: {
            "id-balance": {
              name: "Équilibre assuré",
              description: "<p>un test pour @[[/act balance]]{Garder l'équilibre}, il devient</p>",
            },
          },
        },
      },
    },
  });

  const out = buildCreatureI18n({
    creatureName: "Harbormaster",
    creatureFoundryId: "harbormaster-id",
    ownPack: "pathfinder-npc-core",
    actions: [{ name: "Steady Balance", foundryId: "id-balance" }],
    attacks: [],
    table,
    lang: {},
  })!;

  it("drops the stray @ and keeps the enricher intact", () => {
    expect(out.actions[0]!.description).toBe(
      "<p>un test pour [[/act balance]]{Garder l'équilibre}, il devient</p>",
    );
  });

  it("does NOT strip @ from a single-bracket marker -- that would hide it from the guard", () => {
    // The repair is deliberately narrow (`@` immediately before `[[`). A
    // broader `@(?=\[)` would turn an unknown `@[...]` marker into ordinary
    // bracket text, which `verifyI18nMarkup` can no longer report: silently
    // erasing the evidence instead of surfacing it.
    expect(resolveFrenchProbe("<p>@[quelque chose]{Label}</p>")).toContain("@[");
  });

  it("leaves an enricher that never had a stray @ untouched", () => {
    expect(resolveFrenchProbe("<p>[[/gmr 1d4 #Recharger]]{1d4 rounds}</p>")).toBe(
      "<p>[[/gmr 1d4 #Recharger]]{1d4 rounds}</p>",
    );
  });
});

/** Exercises the same resolution the builders apply, through the only public
 * door there is -- a one-action creature overlay. */
function resolveFrenchProbe(html: string): string {
  const table = makeBabeleTable({
    "pf2e.pathfinder-bestiary.json": {
      entries: { X: { name: "X", items: { i: { description: html } } } },
    },
  });
  return buildCreatureI18n({
    creatureName: "X",
    creatureFoundryId: "x-id",
    ownPack: "pathfinder-bestiary",
    actions: [{ name: "A", foundryId: "i" }],
    attacks: [],
    table,
    lang: {},
  })!.actions[0]!.description!;
}
