import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { IndexEntry } from "@pf2/schema";
import { AddCombatants } from "../src/components/AddCombatants.js";
import { QuickAdd } from "../src/components/QuickAdd.js";
import { searchCreatures } from "../src/data/catalog.js";
import type { IndexI18n } from "../src/data/i18nOverlay.js";
import { parseAddCommand } from "../src/rules/parseAddCommand.js";
import { rankMatches } from "../src/rules/rankMatches.js";
import { useEncounter } from "../src/state/store.js";

/**
 * The two search paths (`rankMatches` for QuickAdd, `searchCreatures` for
 * AddCombatants) both need to match a French query against a French name,
 * ignoring the accents nobody types at speed, without disturbing English
 * search. Real ids/names throughout — pulled from data/index/*.json and
 * data/i18n/fr/index/*.json — except where a test is purely about the
 * ranking algorithm's tiering, which follows rank-matches.test.ts's own
 * convention of synthetic fixtures.
 */

const entry = (over: Partial<IndexEntry>): IndexEntry =>
  ({
    id: "pack/x", slug: "x", name: "X", level: 1, rarity: "common", size: "medium",
    traits: [], ac: 15, hp: 10, remaster: true, book: "Pack",
    ...over,
  }) as IndexEntry;

// data/index/pathfinder-monster-core.json / data/i18n/fr/index/pathfinder-monster-core.json
const quatoidEn = entry({
  id: "pathfinder-monster-core/quatoid", slug: "quatoid", name: "Quatoid",
  level: 7, rarity: "common", size: "small", traits: ["aquatic", "elemental", "water"],
  ac: 25, hp: 120, remaster: true, book: "Pathfinder Monster Core",
});
const QUATOID_FR = "Quatoïde (Élémentaire, eau)";

// data/index/kingmaker-bestiary.json / data/i18n/fr/index/kingmaker-bestiary.json
const stagLordEn = entry({
  id: "kingmaker-bestiary/the-stag-lord", slug: "the-stag-lord", name: "The Stag Lord",
  level: 6, rarity: "unique", size: "medium", traits: ["human", "humanoid"],
  ac: 23, hp: 110, remaster: false, book: "Pathfinder Kingmaker",
});
const STAG_LORD_FR = "Seigneur Cerf";

// data/index/pathfinder-monster-core.json + pathfinder-bestiary-2.json — both
// translate to "Serpent de mer" in data/i18n/fr/index, at very different levels.
const seaSerpentEn = entry({
  id: "pathfinder-monster-core/sea-serpent", slug: "sea-serpent", name: "Sea Serpent",
  level: 12, rarity: "uncommon", size: "gargantuan", traits: ["animal", "aquatic"],
  ac: 35, hp: 210, remaster: true, book: "Pathfinder Monster Core",
});
const seaSnakeEn = entry({
  id: "pathfinder-bestiary-2/sea-snake", slug: "sea-snake", name: "Sea Snake",
  level: 0, rarity: "common", size: "small", traits: ["animal"],
  ac: 16, hp: 15, remaster: false, book: "Pathfinder Bestiary 2",
});
const SEA_SERPENT_FR = "Serpent de mer";
const SEA_SNAKE_FR = "Serpent de mer";

const frenchIndexByPack: Record<string, IndexI18n> = {
  "pathfinder-monster-core": {
    "pathfinder-monster-core/quatoid": QUATOID_FR,
    "pathfinder-monster-core/sea-serpent": SEA_SERPENT_FR,
  },
  "kingmaker-bestiary": { "kingmaker-bestiary/the-stag-lord": STAG_LORD_FR },
  "pathfinder-bestiary-2": { "pathfinder-bestiary-2/sea-snake": SEA_SNAKE_FR },
};

const loadIndexI18nFn = async (pack: string): Promise<IndexI18n> => frenchIndexByPack[pack] ?? {};

describe("fold-based matching (pure)", () => {
  it("rankMatches finds an accented name from an unaccented query", () => {
    const out = rankMatches([entry({ id: "x/quatoid", name: QUATOID_FR })], "elementaire");
    expect(out.map((e) => e.name)).toContain(QUATOID_FR);
  });

  it("rankMatches finds an exact accented name from an unaccented query", () => {
    const out = rankMatches([entry({ id: "x/stag", name: STAG_LORD_FR })], "seigneur cerf");
    expect(out.map((e) => e.name)).toEqual([STAG_LORD_FR]);
  });

  it("searchCreatures finds an accented name from an unaccented query", () => {
    const out = searchCreatures([entry({ id: "x/quatoid", name: QUATOID_FR })], "elementaire");
    expect(out.map((e) => e.name)).toContain(QUATOID_FR);
  });

  // Both the candidate name AND the query must be folded — an already
  // diacritic-free candidate ("elementaire") no longer contains an
  // ACCENTED query ("Élémentaire") unless the query is folded too. This
  // catches a folder that only strips the candidate's accents.
  it("rankMatches also folds an accented query, not just the candidate name", () => {
    const out = rankMatches([entry({ id: "x/quatoid", name: QUATOID_FR })], "Élémentaire");
    expect(out.map((e) => e.name)).toContain(QUATOID_FR);
  });

  it("searchCreatures also folds an accented query, not just the candidate name", () => {
    const out = searchCreatures([entry({ id: "x/quatoid", name: QUATOID_FR })], "Élémentaire");
    expect(out.map((e) => e.name)).toContain(QUATOID_FR);
  });

  it("rankMatches ranks a hit on the name proper ahead of a hit confined to the qualifier", () => {
    // "Aardvark (Génie)" only matches "genie" inside its qualifier; "Génie"
    // matches it in the name proper. "Aardvark..." sorts alphabetically
    // BEFORE "Génie", so this only passes if the qualifier tier is actually
    // lower-ranked — an alphabetical tie-break could not accidentally save it.
    const aardvark = entry({ id: "x/aardvark", name: "Aardvark (Génie)" });
    const genie = entry({ id: "x/genie", name: "Génie" });
    const out = rankMatches([aardvark, genie], "genie");
    expect(out.map((e) => e.name)).toEqual(["Génie", "Aardvark (Génie)"]);
  });

  it("searchCreatures ranks a hit on the name proper ahead of a hit confined to the qualifier", () => {
    const aardvark = entry({ id: "x/aardvark", name: "Aardvark (Génie)" });
    const genie = entry({ id: "x/genie", name: "Génie" });
    const out = searchCreatures([aardvark, genie], "genie");
    expect(out.map((e) => e.name)).toEqual(["Génie", "Aardvark (Génie)"]);
  });

  it("breaks ties on the ORIGINAL (unfolded) strings via compareStrings, never localeCompare", () => {
    // Both fold to "elan" and tie at the exact-match tier; compareStrings on
    // the raw strings orders "Elan" (E=U+0045) before "Élan" (É=U+00C9) by
    // code unit — a locale-aware collator is exactly where this could differ.
    const elanPlain = entry({ id: "b/elan", name: "Elan" });
    const elanAccented = entry({ id: "a/elan", name: "Élan" });
    const out = rankMatches([elanAccented, elanPlain], "elan");
    expect(out.map((e) => e.name)).toEqual(["Elan", "Élan"]);
  });
});

describe("parseAddCommand needs no change for French input", () => {
  it("parses quantity and initiative around a French name", () => {
    // Verified against all 1420 French names: none starts or ends with a digit.
    expect(parseAddCommand("6 gobelin 13")).toEqual({
      quantity: 6, nameQuery: "gobelin", initiative: 13, requestedQuantity: 6,
    });
  });
});

describe("AddCombatants searches in the active language", () => {
  beforeEach(() => useEncounter.getState().reset());

  it("searches English names when lang is en", async () => {
    const user = userEvent.setup();
    render(<AddCombatants entries={[quatoidEn, stagLordEn]} loadIndexI18nFn={loadIndexI18nFn} />);
    await user.type(screen.getByLabelText(/search/i), "stag lord");
    expect(screen.getByText("The Stag Lord")).toBeDefined();
    expect(screen.queryByText(QUATOID_FR)).toBeNull();
  });

  it("searches French names, ignoring accents, when lang is fr", async () => {
    const user = userEvent.setup();
    useEncounter.getState().setLang("fr");
    render(<AddCombatants entries={[quatoidEn, stagLordEn]} loadIndexI18nFn={loadIndexI18nFn} />);
    await user.type(screen.getByRole("textbox"), "elementaire");
    expect(await screen.findByText(QUATOID_FR)).toBeDefined();
    expect(screen.queryByText("Quatoid")).toBeNull();
  });

  it("distinguishes the two creatures both called Serpent de mer, showing level and book", async () => {
    const user = userEvent.setup();
    useEncounter.getState().setLang("fr");
    render(<AddCombatants entries={[seaSerpentEn, seaSnakeEn]} loadIndexI18nFn={loadIndexI18nFn} />);
    await user.type(screen.getByRole("textbox"), "serpent de mer");

    const rows = await screen.findAllByText(SEA_SERPENT_FR);
    expect(rows).toHaveLength(2);

    const listItems = rows.map((el) => el.closest("div")!.parentElement!.parentElement!);
    const texts = listItems.map((el) => el.textContent ?? "");
    expect(texts.some((t) => t.includes("12") && t.includes("Pathfinder Monster Core"))).toBe(true);
    expect(texts.some((t) => t.includes("0") && t.includes("Pathfinder Bestiary 2"))).toBe(true);
  });
});

describe("QuickAdd searches in the active language", () => {
  beforeEach(() => useEncounter.getState().reset());

  it("shows the French name in the dropdown for an unaccented query, when lang is fr", async () => {
    const user = userEvent.setup();
    useEncounter.getState().setLang("fr");
    render(<QuickAdd entries={[quatoidEn, stagLordEn]} loadIndexI18nFn={loadIndexI18nFn} />);
    await user.type(screen.getByRole("combobox"), "elementaire");
    const listbox = await screen.findByRole("listbox");
    expect(within(listbox).getByText(QUATOID_FR)).toBeDefined();
  });

  it("still shows the English name in the dropdown when lang is en", async () => {
    const user = userEvent.setup();
    render(<QuickAdd entries={[quatoidEn, stagLordEn]} loadIndexI18nFn={loadIndexI18nFn} />);
    await user.type(screen.getByRole("combobox", { name: /quick add/i }), "quatoid");
    const listbox = await screen.findByRole("listbox");
    expect(within(listbox).getByText("Quatoid")).toBeDefined();
  });
});
