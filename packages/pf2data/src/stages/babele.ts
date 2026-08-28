import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { compareStrings } from "../util.js";

export interface BabeleEntry {
  name: string;
  description?: string;
  blurb?: string;
  items?: Record<string, { name?: string; description?: string }>;
}

/** Which kind of thing a Babele file translates. One English string can name
 * more than one kind — `Guard` is "Garde" the creature and "Se défendre" the
 * action — so lookups never cross a kind boundary. */
export type BabeleKind = "creature" | "condition" | "glossary" | "other";

export interface BabeleTable {
  /** pack name (the `pf2e.<pack>.json` stem) -> that pack's entries. */
  byPack: Map<string, Map<string, BabeleEntry>>;
  kindOf(pack: string): BabeleKind;
  /** Own pack first, then every other pack of the same kind in
   * `compareStrings` filename order. Throws if the fallback sources disagree. */
  lookup(kind: BabeleKind, ownPack: string, englishName: string): BabeleEntry | null;
}

const EXPLICIT_CREATURE_STEMS = new Set([
  "pathfinder-monster-core",
  "pathfinder-monster-core-2",
  "pathfinder-npc-core",
]);

function classify(stem: string): BabeleKind {
  if (stem === "conditionitems") return "condition";
  if (stem.includes("ability-glossary")) return "glossary";
  if (
    (stem.includes("bestiary") && !stem.includes("glossary")) ||
    EXPLICIT_CREATURE_STEMS.has(stem)
  ) {
    return "creature";
  }
  return "other";
}

function stemOf(file: string): string {
  return file.slice("pf2e.".length, -".json".length);
}

/**
 * Reads every `pf2e.*.json` Babele translation file in `babeleDir`, keeping
 * each pack's `entries` separate rather than merging them into one flat
 * table: `lookup` needs to know which pack an entry came from so it can
 * prefer the caller's own pack, and only fall back to other packs of the
 * SAME kind when the own pack has no entry.
 *
 * Files are read in `compareStrings` filename order — never raw
 * `readdirSync` order, which is not guaranteed — so that fallback
 * resolution is deterministic across runs.
 */
export function loadBabele(babeleDir: string): BabeleTable {
  const files = readdirSync(babeleDir)
    .filter((name) => name.startsWith("pf2e.") && name.endsWith(".json"))
    .sort(compareStrings);

  const byPack = new Map<string, Map<string, BabeleEntry>>();
  const packOrder: string[] = [];

  for (const file of files) {
    const raw: unknown = JSON.parse(readFileSync(join(babeleDir, file), "utf8"));
    const entries = (raw as { entries?: unknown }).entries;
    if (entries === null || typeof entries !== "object" || Array.isArray(entries)) {
      continue;
    }

    const packEntries = new Map<string, BabeleEntry>();
    for (const [englishName, entry] of Object.entries(
      entries as Record<string, unknown>,
    )) {
      if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
        continue;
      }
      packEntries.set(englishName, entry as BabeleEntry);
    }

    const stem = stemOf(file);
    byPack.set(stem, packEntries);
    packOrder.push(stem);
  }

  const kindOf = (pack: string): BabeleKind => classify(pack);

  const lookup = (
    kind: BabeleKind,
    ownPack: string,
    englishName: string,
  ): BabeleEntry | null => {
    const own = byPack.get(ownPack)?.get(englishName);
    if (own) return own;

    let winner: { pack: string; entry: BabeleEntry } | null = null;
    for (const pack of packOrder) {
      if (pack === ownPack) continue;
      if (classify(pack) !== kind) continue;
      const entry = byPack.get(pack)?.get(englishName);
      if (!entry) continue;

      if (winner === null) {
        winner = { pack, entry };
        continue;
      }
      if (winner.entry.name !== entry.name) {
        throw new Error(
          `Babele fallback sources disagree about the French name for "${englishName}": ` +
            `pf2e.${winner.pack}.json says "${winner.entry.name}", ` +
            `pf2e.${pack}.json says "${entry.name}".`,
        );
      }
    }

    return winner ? winner.entry : null;
  };

  return { byPack, kindOf, lookup };
}
