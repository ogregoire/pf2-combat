import { describe, expect, it, afterAll, vi } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadArchive } from "../src/stages/archive.js";

// Same rationale, and same fix, as babele.test.ts: this sandbox's filesystem
// (APFS) was empirically observed to always return readdirSync results in
// code-unit-sorted order already, so a fixture relying on raw filesystem
// order to diverge from `compareStrings` order can never exercise that
// divergence here. Every test in this file runs against a REVERSED listing,
// forcing `loadArchive` to prove it re-sorts rather than happening to work
// because the host FS already sorted things for it.
vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    ...actual,
    readdirSync: (...args: Parameters<typeof actual.readdirSync>) =>
      [...(actual.readdirSync(...args) as string[])].reverse(),
  };
});

const tmpDirs: string[] = [];
afterAll(() => {
  for (const dir of tmpDirs) rmSync(dir, { recursive: true, force: true });
});

/** Builds `<dir>/archive/<pack>/<foundryId>.htm` for each file given, and
 * returns `<dir>/archive` -- the directory `loadArchive` itself reads. */
function makeArchive(files: Record<string, Record<string, string>>): string {
  const root = mkdtempSync(join(tmpdir(), "archive-fixture-"));
  tmpDirs.push(root);
  const archiveDir = join(root, "archive");
  for (const [pack, records] of Object.entries(files)) {
    const packDir = join(archiveDir, pack);
    mkdirSync(packDir, { recursive: true });
    for (const [foundryId, content] of Object.entries(records)) {
      writeFileSync(join(packDir, `${foundryId}.htm`), content);
    }
  }
  return archiveDir;
}

// A real record, taken from the module's own archive/pathfinder-bestiary-2
// directory (foundry id 6FltuGxvUoNH9b17) -- the exact shape `loadArchive`
// has to parse, not a simplified stand-in.
const PETITIONER_RECORD = `Name: Petitioner (Plane of Air)
Nom: Pétitionnaire (Plan de l'air)
État: officielle

-- Desc (en) --
<p>When a mortal dies, their soul travels to the Boneyard.</p>
-- Desc (fr) --
<p>Lorsqu'un mortel meurt, son âme voyage jusqu'au Cimetière.</p>
-- End desc ---

----- Items -------------------------------------------------------------------
ID: 7RlCpEdZ5Lw3Omd2
Name: Gust
Nom: Rafale

ID: 9yu44cM7W0Xg2Q36
Name: Planar Incarnation - Plane of Air
Nom: Incarnation planaire - Plan de l'Air
-- Desc (en) --
<p>All petitioners are formed from and personify the nature of the plane.</p>
-- Desc (fr) --
<p>Tous les pétitionnaires incarnent la nature du plan.</p>
-- End desc ---

ID: HUJdrgu9JAWlm7bC
Name: Planar Lore
Nom: Connaissance planaire

-------------------------------------------------------------------------------
`;

describe("loadArchive", () => {
  it("parses a record's English and French names", () => {
    const dir = makeArchive({ "pathfinder-bestiary-2": { "6FltuGxvUoNH9b17": PETITIONER_RECORD } });
    expect(loadArchive(dir).get("6FltuGxvUoNH9b17")).toMatchObject({
      en: "Petitioner (Plane of Air)",
      fr: "Pétitionnaire (Plan de l'air)",
    });
  });

  it("pairs the creature's own Desc (en)/(fr), not one from a child item", () => {
    const dir = makeArchive({ "pathfinder-bestiary-2": { "6FltuGxvUoNH9b17": PETITIONER_RECORD } });
    const rec = loadArchive(dir).get("6FltuGxvUoNH9b17")!;
    expect(rec.description).toMatch(/^<p>Lorsqu'un mortel meurt/);
  });

  it("also parses child items, keyed by their own ID: line", () => {
    const dir = makeArchive({ "pathfinder-bestiary-2": { "6FltuGxvUoNH9b17": PETITIONER_RECORD } });
    const rec = loadArchive(dir).get("6FltuGxvUoNH9b17")!;
    expect(rec.items["7RlCpEdZ5Lw3Omd2"]).toMatchObject({ en: "Gust", fr: "Rafale", description: null });
    expect(rec.items["9yu44cM7W0Xg2Q36"]).toMatchObject({
      en: "Planar Incarnation - Plane of Air",
      fr: "Incarnation planaire - Plan de l'Air",
    });
    expect(rec.items["9yu44cM7W0Xg2Q36"]!.description).toMatch(/^<p>Tous les pétitionnaires/);
    // An item with no Desc pair at all -- its OWN entry, not the previous
    // item's, must show a null description.
    expect(rec.items["HUJdrgu9JAWlm7bC"]).toMatchObject({ en: "Planar Lore", description: null });
  });

  it("yields no French body when a record has none", () => {
    const dir = makeArchive({
      pack: { nobody: "Name: Nobody\nNom: Personne\nÉtat: officielle\n\n" },
    });
    expect(loadArchive(dir).get("nobody")!.description).toBeNull();
  });

  it("yields null fr for a child item with an empty Nom: line", () => {
    // 2 real items in the legacy bestiary look like this -- an item name
    // Babele's own module never got around to translating.
    const record = [
      "Name: Parent",
      "Nom: Parent FR",
      "État: officielle",
      "",
      "ID: item-1",
      "Name: Untranslated Item",
      "Nom: ",
      "",
    ].join("\n");
    const dir = makeArchive({ pack: { parent: record } });
    expect(loadArchive(dir).get("parent")!.items["item-1"]).toMatchObject({
      en: "Untranslated Item",
      fr: null,
    });
  });

  /**
   * The hazard the brief calls out explicitly: a record repeats the
   * `-- Desc (en) --` / `-- Desc (fr) --` / `-- End desc ---` triad once per
   * item, and NOT every item has a body. A naive parse that collected every
   * `-- Desc (en) --` block into one array and every `-- Desc (fr) --` block
   * into another, then zipped them by index, would drift out of alignment as
   * soon as one block in the middle is missing its French half -- exactly
   * what happens below: item A has an English body with NO French one, so
   * the naive fr-array is one short and everything after it shifts by one.
   */
  it("does not let an item with an English-only body shift later pairings", () => {
    const record = [
      "Name: Top",
      "Nom: Top FR",
      "État: officielle",
      "",
      "-- Desc (en) --",
      "<p>TOP EN</p>",
      "-- Desc (fr) --",
      "<p>TOP FR</p>",
      "-- End desc ---",
      "",
      "ID: item-a",
      "Name: A",
      "Nom: A FR",
      "-- Desc (en) --",
      "<p>A EN ONLY</p>",
      "-- End desc ---",
      "",
      "ID: item-b",
      "Name: B",
      "Nom: B FR",
      "-- Desc (en) --",
      "<p>B EN</p>",
      "-- Desc (fr) --",
      "<p>B FR</p>",
      "-- End desc ---",
      "",
    ].join("\n");
    const dir = makeArchive({ pack: { top: record } });
    const rec = loadArchive(dir).get("top")!;

    // A naive index-zip would pair "A EN ONLY" with "<p>B FR</p>" here.
    expect(rec.items["item-a"]!.description).toBeNull();
    // ...and then find nothing left over for B, instead of B's own text.
    expect(rec.items["item-b"]!.description).toBe("<p>B FR</p>");
    expect(rec.description).toBe("<p>TOP FR</p>");
  });

  it("reads pack directories and files in compareStrings order", () => {
    // A `Map`'s iteration order is INSERTION order, so this IS observable:
    // if `loadArchive` fell back to raw `readdirSync` order (unspecified,
    // and on some filesystems closer to creation order than alphabetical),
    // the keys below -- created in scrambled, non-alphabetical order, both
    // across pack directories and within one -- would not come back sorted.
    const dir = makeArchive({
      "pack-zebra": { "id-mango": "Name: M\nNom: M FR\n", "id-apple": "Name: A\nNom: A FR\n" },
      "pack-apple": { "id-zebra": "Name: Z\nNom: Z FR\n" },
      "pack-mango": { "id-banana": "Name: B\nNom: B FR\n" },
    });
    const table = loadArchive(dir);
    // pack-apple/id-zebra, then pack-mango/id-banana, then pack-zebra's own
    // two files in `id-apple`, `id-mango` order.
    expect([...table.keys()]).toEqual(["id-zebra", "id-banana", "id-apple", "id-mango"]);
  });
});
