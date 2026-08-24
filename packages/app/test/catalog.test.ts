import { describe, expect, it } from "vitest";
import {
  loadBooks, loadIndex, resolveCollisions, searchCreatures,
} from "../src/data/catalog.js";
import type { IndexEntry } from "@pf2/schema";

const entry = (over: Partial<IndexEntry>): IndexEntry =>
  ({
    id: "pathfinder-bestiary/troll", slug: "troll", name: "Troll",
    level: 5, rarity: "common", size: "large", traits: [],
    ac: 19, hp: 115, remaster: false, book: "Pathfinder Bestiary",
    ...over,
  }) as IndexEntry;

const fakeFetch = (body: unknown) =>
  async (): Promise<Response> =>
    new Response(JSON.stringify(body), { status: 200 });

describe("loadBooks", () => {
  it("reads the catalog", async () => {
    const books = await loadBooks(
      fakeFetch([{ pack: "x", title: "X", license: "ORC", remaster: true, creatureCount: 1, indexPath: "index/x.json", mixed: false }]),
    );
    expect(books[0]!.pack).toBe("x");
  });
});

describe("loadIndex", () => {
  it("reads a per-book index", async () => {
    const idx = await loadIndex("pathfinder-bestiary", fakeFetch([entry({})]));
    expect(idx[0]!.name).toBe("Troll");
  });
});

describe("resolveCollisions", () => {
  it("drops the legacy entry when a remaster shares the slug", () => {
    const out = resolveCollisions([
      entry({ id: "pathfinder-bestiary/barghest", slug: "barghest", name: "Barghest", remaster: false }),
      entry({ id: "pathfinder-monster-core/barghest", slug: "barghest", name: "Barghest", remaster: true }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]!.remaster).toBe(true);
  });

  it("keeps both when the slugs differ", () => {
    const out = resolveCollisions([
      entry({ slug: "troll", remaster: false }),
      entry({ id: "pathfinder-monster-core/forest-troll", slug: "forest-troll", name: "Forest Troll", remaster: true }),
    ]);
    expect(out).toHaveLength(2);
  });

  it("is order-independent", () => {
    const a = entry({ id: "a/x", slug: "x", remaster: true });
    const b = entry({ id: "b/x", slug: "x", remaster: false });
    expect(resolveCollisions([a, b])[0]!.id).toBe("a/x");
    expect(resolveCollisions([b, a])[0]!.id).toBe("a/x");
  });
});

describe("searchCreatures", () => {
  const set = [
    entry({ slug: "troll", name: "Troll" }),
    entry({ id: "x/forest-troll", slug: "forest-troll", name: "Forest Troll" }),
    entry({ id: "x/goblin-warrior", slug: "goblin-warrior", name: "Goblin Warrior" }),
  ];

  it("matches case-insensitively on name", () => {
    expect(searchCreatures(set, "TROLL").map((e) => e.slug)).toEqual([
      "forest-troll", "troll",
    ]);
  });

  it("returns everything for an empty query", () => {
    expect(searchCreatures(set, "  ")).toHaveLength(3);
  });

  it("returns results sorted by name deterministically", () => {
    expect(searchCreatures(set, "o").map((e) => e.name)).toEqual([
      "Forest Troll", "Goblin Warrior", "Troll",
    ]);
  });
});
