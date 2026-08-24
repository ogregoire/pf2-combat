import type { IndexEntry } from "@pf2/schema";
import { compareStrings } from "./compare.js";

/** Query characters appear in `text` in order, not necessarily contiguously. */
function isSubsequence(query: string, text: string): boolean {
  let qi = 0;
  for (let ti = 0; ti < text.length && qi < query.length; ti++) {
    if (text[ti] === query[qi]) qi += 1;
  }
  return qi === query.length;
}

/**
 * Ranks `entries` against `query` for the QuickAdd dropdown, tiered from
 * most to least specific: exact name match, name starts with the query, any
 * word in the name starts with it, the name contains it as a substring, or
 * the query's characters appear in order (fuzzy). An entry matching no tier
 * is excluded. Ties within a tier sort by name then id via `compareStrings`
 * — never `localeCompare`, which caused a real non-determinism bug in this
 * repo. `entries` is never mutated; a new array is sorted.
 */
export function rankMatches(entries: IndexEntry[], query: string): IndexEntry[] {
  const q = query.trim().toLowerCase();
  if (q === "") return [];

  const tiered: { entry: IndexEntry; tier: number }[] = [];
  for (const entry of entries) {
    const name = entry.name.toLowerCase();
    let tier: number;
    if (name === q) tier = 1;
    else if (name.startsWith(q)) tier = 2;
    else if (name.split(/\s+/).some((word) => word.startsWith(q))) tier = 3;
    else if (name.includes(q)) tier = 4;
    else if (isSubsequence(q, name)) tier = 5;
    else continue;
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
