import type { IndexEntry } from "@pf2/schema";
import { compareStrings } from "./compare.js";
import { fold, namePart } from "./fold.js";

/** Query characters appear in `text` in order, not necessarily contiguously. */
function isSubsequence(query: string, text: string): boolean {
  let qi = 0;
  for (let ti = 0; ti < text.length && qi < query.length; ti++) {
    if (text[ti] === query[qi]) qi += 1;
  }
  return qi === query.length;
}

/** Tiers 1-5, most to least specific: exact, name starts with the query, any
 * word starts with it, contains it as a substring, or the query's
 * characters appear in order (fuzzy). 0 means no tier matched. Both `name`
 * and `q` must already be folded. */
function matchTier(name: string, q: string): number {
  if (name === q) return 1;
  if (name.startsWith(q)) return 2;
  if (name.split(/\s+/).some((word) => word.startsWith(q))) return 3;
  if (name.includes(q)) return 4;
  if (isSubsequence(q, name)) return 5;
  return 0;
}

/**
 * Ranks `entries` against `query` for the QuickAdd dropdown. Both the query
 * and every candidate name are folded (`fold.js`) before comparison, so an
 * unaccented query like "elementaire" finds "Élémentaire" — 41% of French
 * names carry accents nobody types at speed. Tiered from most to least
 * specific against the name's part before any parenthesised qualifier
 * (tiers 1-5); an entry that only matches within its qualifier — "Jann
 * (Génie)" — falls to tiers 6-10 instead, so a qualifier hit never outranks
 * a hit on the name proper. An entry matching neither is excluded. Ties
 * within a tier sort by name then id via `compareStrings` on the ORIGINAL
 * (unfolded) strings — never `localeCompare`, which caused a real
 * non-determinism bug in this repo. `entries` is never mutated; a new array
 * is sorted.
 */
export function rankMatches(entries: IndexEntry[], query: string): IndexEntry[] {
  const q = fold(query.trim());
  if (q === "") return [];

  const tiered: { entry: IndexEntry; tier: number }[] = [];
  for (const entry of entries) {
    const properTier = matchTier(fold(namePart(entry.name)), q);
    let tier: number;
    if (properTier !== 0) {
      tier = properTier;
    } else {
      const fullTier = matchTier(fold(entry.name), q);
      if (fullTier === 0) continue;
      tier = fullTier + 5;
    }
    tiered.push({ entry, tier });
  }

  tiered.sort(
    (a, b) =>
      a.tier - b.tier ||
      compareStrings(a.entry.name, b.entry.name) ||
      compareStrings(a.entry.id, b.entry.id),
  );

  return tiered.map((t) => t.entry);
}
