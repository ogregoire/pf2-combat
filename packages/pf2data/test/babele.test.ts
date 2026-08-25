import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadBabele } from "../src/stages/babele.js";

describe("loadBabele", () => {
  describe("merging", () => {
    let dir: string;

    beforeAll(() => {
      dir = mkdtempSync(join(tmpdir(), "babele-merge-"));
      writeFileSync(
        join(dir, "pf2e.bestiary-1.json"),
        JSON.stringify({
          label: "Bestiary 1",
          entries: {
            "The Stag Lord": { name: "Seigneur Cerf" },
          },
        }),
      );
      writeFileSync(
        join(dir, "pf2e.bestiary-2.json"),
        JSON.stringify({
          label: "Bestiary 2",
          entries: {
            Manticore: { name: "Manticore FR" },
          },
        }),
      );
    });

    afterAll(() => rmSync(dir, { recursive: true, force: true }));

    it("merges every pack file into one name-keyed table", () => {
      const table = loadBabele(dir);
      expect(table.get("The Stag Lord")!.name).toBe("Seigneur Cerf");
      expect(table.get("Manticore")!.name).toBe("Manticore FR");
    });
  });

  describe("agreement across files", () => {
    let dir: string;

    beforeAll(() => {
      dir = mkdtempSync(join(tmpdir(), "babele-agree-"));
      // "z" sorts after "a" by filename, so pf2e.a-pack.json is read first;
      // its entry must be the one that wins.
      writeFileSync(
        join(dir, "pf2e.a-pack.json"),
        JSON.stringify({
          entries: {
            Barghest: { name: "Barghest" },
          },
        }),
      );
      writeFileSync(
        join(dir, "pf2e.z-pack.json"),
        JSON.stringify({
          entries: {
            Barghest: { name: "Barghest" },
          },
        }),
      );
    });

    afterAll(() => rmSync(dir, { recursive: true, force: true }));

    it("keeps the first file's entry when two agree, deterministically by filename", () => {
      const table = loadBabele(dir);
      expect(table.get("Barghest")!.name).toBe("Barghest");
    });
  });

  describe("disagreement across files", () => {
    let dir: string;

    beforeAll(() => {
      dir = mkdtempSync(join(tmpdir(), "babele-disagree-"));
      writeFileSync(
        join(dir, "pf2e.a-pack.json"),
        JSON.stringify({
          entries: {
            Ogre: { name: "Ogre FR" },
          },
        }),
      );
      writeFileSync(
        join(dir, "pf2e.b-pack.json"),
        JSON.stringify({
          entries: {
            Ogre: { name: "Ogre Different" },
          },
        }),
      );
    });

    afterAll(() => rmSync(dir, { recursive: true, force: true }));

    it("throws when two files disagree about a French name", () => {
      expect(() => loadBabele(dir)).toThrow(/disagree/i);
    });

    it("names both files and both French values in the error message", () => {
      expect(() => loadBabele(dir)).toThrow(
        /pf2e\.a-pack\.json.*Ogre FR.*pf2e\.b-pack\.json.*Ogre Different/s,
      );
    });
  });

  describe("skipping malformed entries", () => {
    let dir: string;

    beforeAll(() => {
      dir = mkdtempSync(join(tmpdir(), "babele-skip-"));
      writeFileSync(
        join(dir, "pf2e.folders-only.json"),
        JSON.stringify({
          label: "Folders only",
          entries: "not-an-object",
        }),
      );
      writeFileSync(
        join(dir, "pf2e.real.json"),
        JSON.stringify({
          entries: {
            Wolf: { name: "Loup" },
          },
        }),
      );
    });

    afterAll(() => rmSync(dir, { recursive: true, force: true }));

    it("skips files whose entries is not an object", () => {
      const table = loadBabele(dir);
      expect(table.get("Wolf")!.name).toBe("Loup");
      expect(table.size).toBe(1);
    });
  });
});
