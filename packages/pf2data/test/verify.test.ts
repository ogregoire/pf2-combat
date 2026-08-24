import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Manifest } from "@pf2/schema";
import { normalizeCreature } from "../src/normalize/creature.js";
import { buildIndexes } from "../src/stages/index.js";
import { verifyDataset } from "../src/stages/verify.js";

const stagLord = normalizeCreature(
  JSON.parse(
    readFileSync(
      fileURLToPath(new URL("./fixtures/the-stag-lord.json", import.meta.url)),
      "utf8",
    ),
  ),
  "kingmaker-bestiary",
  "the-stag-lord",
);

const manifest = (overrides: Partial<Manifest> = {}): Manifest => ({
  toolVersion: "0.0.0",
  upstreamRepo: "https://github.com/foundryvtt/pf2e",
  upstreamRef: "abc123",
  generatedAt: "2026-08-24T00:00:00.000Z",
  packs: ["kingmaker-bestiary"],
  creatureCount: 1,
  collisions: [],
  ...overrides,
});

describe("verifyDataset", () => {
  it("passes on a consistent dataset", () => {
    const build = buildIndexes([stagLord]);
    const result = verifyDataset({
      creatures: [stagLord],
      books: build.books,
      indexes: build.indexes,
      manifest: manifest(),
    });
    expect(result).toEqual({ ok: true, failures: [] });
  });

  it("fails when a book count disagrees with its index", () => {
    const build = buildIndexes([stagLord]);
    build.books[0]!.creatureCount = 99;
    const result = verifyDataset({
      creatures: [stagLord],
      books: build.books,
      indexes: build.indexes,
      manifest: manifest(),
    });
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
      manifest: manifest(),
    });
    expect(result.ok).toBe(false);
    expect(result.failures.join(" ")).toMatch(/@UUID/);
  });

  it("fails when the collision set drifts from the manifest", () => {
    const build = buildIndexes([stagLord]);
    const result = verifyDataset({
      creatures: [stagLord],
      books: build.books,
      indexes: build.indexes,
      manifest: manifest({
        collisions: [{ slug: "barghest", ids: ["a/barghest", "b/barghest"] }],
      }),
    });
    expect(result.ok).toBe(false);
    expect(result.failures.join(" ")).toMatch(/collision/i);
  });
});
