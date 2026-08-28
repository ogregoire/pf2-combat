import { describe, expect, it, beforeAll, afterAll, vi } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadBabele } from "../src/stages/babele.js";

// This sandbox's filesystem (APFS) was empirically observed to always
// return readdirSync results in code-unit-sorted order, regardless of
// creation order or filename choice — so a fixture relying on raw
// filesystem order to diverge from `compareStrings` order can never
// exercise that divergence here. POSIX doesn't guarantee any particular
// readdir order, so every test in this file runs against a REVERSED
// listing to force loadBabele to prove it re-sorts, rather than happening
// to work because the host FS already sorted things for it.
vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    ...actual,
    readdirSync: (...args: Parameters<typeof actual.readdirSync>) =>
      [...(actual.readdirSync(...args) as string[])].reverse(),
  };
});

function makeDir(prefix: string, files: Record<string, unknown>): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(join(dir, name), JSON.stringify(content));
  }
  return dir;
}

describe("loadBabele", () => {
  describe("own pack vs. cross-pack fallback", () => {
    let dir: string;

    beforeAll(() => {
      dir = makeDir("babele-fallback-", {
        "pf2e.kingmaker-bestiary.json": {
          entries: { Shambler: { name: "Tertre errant" } },
        },
        "pf2e.pathfinder-bestiary.json": {
          entries: { Shambler: { name: "Grand tertre" } },
        },
        "pf2e.pathfinder-bestiary-2.json": {
          entries: { Manticore: { name: "Manticore FR" } },
        },
        "pf2e.pathfinder-npc-core.json": {
          entries: { Guard: { name: "Garde" } },
        },
        "pf2e.actionspf2e.json": {
          entries: { Guard: { name: "Se défendre" } },
        },
      });
    });

    afterAll(() => rmSync(dir, { recursive: true, force: true }));

    it("resolves a creature against its own pack first", () => {
      const t = loadBabele(dir);
      expect(t.lookup("creature", "kingmaker-bestiary", "Shambler")!.name).toBe(
        "Tertre errant",
      );
      expect(t.lookup("creature", "pathfinder-bestiary", "Shambler")!.name).toBe(
        "Grand tertre",
      );
    });

    it("falls back to another pack of the SAME kind when the own pack has no entry", () => {
      const t = loadBabele(dir);
      expect(t.lookup("creature", "pathfinder-bestiary", "Manticore")!.name).toBe(
        "Manticore FR",
      );
    });

    it("never crosses a kind boundary (own-pack case from the brief)", () => {
      const t = loadBabele(dir);
      expect(t.lookup("creature", "pathfinder-npc-core", "Guard")!.name).toBe("Garde");
    });

    it("never crosses a kind boundary during fallback, even when the wrong-kind pack sorts first", () => {
      // "actionspf2e" (other kind) sorts alphabetically before every
      // creature pack here and also defines "Guard" — if the kind filter in
      // the fallback loop were removed, this would wrongly return
      // "Se défendre" instead of the creature translation "Garde" from
      // pathfinder-npc-core.
      const t = loadBabele(dir);
      expect(t.lookup("creature", "pathfinder-bestiary", "Guard")!.name).toBe("Garde");
    });

    it("returns null for a name with no entry of that kind", () => {
      const t = loadBabele(dir);
      expect(t.lookup("creature", "pathfinder-bestiary", "Ankou")).toBeNull();
    });
  });

  describe("fallback order is deterministic by filename, not by disk order", () => {
    let dir: string;

    beforeAll(() => {
      dir = makeDir("babele-order-", {
        "pf2e.aaa-bestiary.json": {
          entries: {
            "Same Name Thing": { name: "Nom Commun", description: "from aaa" },
          },
        },
        "pf2e.zzz-bestiary.json": {
          entries: {
            "Same Name Thing": { name: "Nom Commun", description: "from zzz" },
          },
        },
      });
    });

    afterAll(() => rmSync(dir, { recursive: true, force: true }));

    it("prefers the compareStrings-first fallback pack when sources agree on name", () => {
      const t = loadBabele(dir);
      const entry = t.lookup("creature", "some-other-pack", "Same Name Thing");
      // Both packs agree on the French `name`, so this isn't a disagreement;
      // the `description` field (identical between the two only in `name`)
      // is what reveals which pack's entry object actually won.
      expect(entry!.description).toBe("from aaa");
    });
  });

  describe("disagreement between fallback sources", () => {
    let dir: string;

    beforeAll(() => {
      dir = makeDir("babele-disagree-", {
        "pf2e.a-bestiary.json": {
          entries: { Contested: { name: "Value A" } },
        },
        "pf2e.z-bestiary.json": {
          entries: { Contested: { name: "Value B" } },
        },
      });
    });

    afterAll(() => rmSync(dir, { recursive: true, force: true }));

    it("throws when two same-kind fallback sources disagree", () => {
      const t = loadBabele(dir);
      expect(() => t.lookup("creature", "some-pack", "Contested")).toThrow(/disagree/i);
    });

    it("names both files and both French values in the error message", () => {
      const t = loadBabele(dir);
      let message = "";
      try {
        t.lookup("creature", "some-pack", "Contested");
      } catch (error) {
        message = String(error);
      }
      expect(message).toContain("pf2e.a-bestiary.json");
      expect(message).toContain("Value A");
      expect(message).toContain("pf2e.z-bestiary.json");
      expect(message).toContain("Value B");
    });
  });

  describe("malformed entries", () => {
    let dir: string;

    beforeAll(() => {
      dir = makeDir("babele-malformed-", {
        "pf2e.folders-only.json": {
          label: "Folders only",
          entries: "not-an-object",
        },
        "pf2e.mixed.json": {
          entries: {
            Wolf: { name: "Loup" },
            "Some Folder": "just a string, not an entry object",
          },
        },
      });
    });

    afterAll(() => rmSync(dir, { recursive: true, force: true }));

    it("skips a whole file whose entries is not an object", () => {
      const t = loadBabele(dir);
      expect(t.byPack.has("folders-only")).toBe(false);
    });

    it("skips an individual entry whose value is not an object", () => {
      const t = loadBabele(dir);
      const pack = t.byPack.get("mixed")!;
      expect(pack.get("Wolf")!.name).toBe("Loup");
      expect(pack.has("Some Folder")).toBe(false);
    });
  });

  describe("kindOf classification", () => {
    let dir: string;

    beforeAll(() => {
      // kindOf classifies from the pack name alone, but loadBabele needs at
      // least one file to return a table.
      dir = makeDir("babele-kindof-", {
        "pf2e.placeholder.json": { entries: {} },
      });
    });

    afterAll(() => rmSync(dir, { recursive: true, force: true }));

    it("classifies bestiary packs, including the explicit monster/npc core stems, as creature", () => {
      const t = loadBabele(dir);
      expect(t.kindOf("pathfinder-bestiary")).toBe("creature");
      expect(t.kindOf("kingmaker-bestiary")).toBe("creature");
      expect(t.kindOf("pathfinder-monster-core")).toBe("creature");
      expect(t.kindOf("pathfinder-monster-core-2")).toBe("creature");
      expect(t.kindOf("pathfinder-npc-core")).toBe("creature");
    });

    it("classifies conditionitems as condition", () => {
      const t = loadBabele(dir);
      expect(t.kindOf("conditionitems")).toBe("condition");
    });

    it("classifies the ability-glossary stems as glossary, even though they contain 'bestiary'", () => {
      const t = loadBabele(dir);
      expect(t.kindOf("bestiary-ability-glossary-srd")).toBe("glossary");
      expect(t.kindOf("bestiary-family-ability-glossary")).toBe("glossary");
    });

    it("classifies everything else as other", () => {
      const t = loadBabele(dir);
      expect(t.kindOf("actionspf2e")).toBe("other");
      expect(t.kindOf("equipment-srd")).toBe("other");
    });
  });
});
