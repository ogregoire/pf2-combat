/**
 * Locale-independent ordering. `localeCompare` follows the machine's ICU
 * locale, which made the data pipeline non-deterministic across machines;
 * the same trap applies to anything the UI sorts and then persists.
 */
export function compareStrings(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

// One Intl.Collator per language, reused across calls — constructing one is
// measurably more expensive than a single string compare, and the same
// handful of languages (just "en"/"fr" here) gets sorted by on every render
// of every list that orders itself by display name.
const collators = new Map<string, Intl.Collator>();

/**
 * Locale-aware ordering, for display lists the GM actually reads (e.g. the
 * condition picker) — the opposite tradeoff from `compareStrings` above.
 * `compareStrings`'s ICU non-determinism concern only bites when the sorted
 * order is persisted or fed through the data pipeline; a render-time list
 * that's recomputed from the current language every time has nothing to be
 * non-deterministic *about*. Sorting such a list with `compareStrings`
 * instead would order accented letters by raw code point — e.g. French
 * "Ébloui" would sort after every unaccented word, dead last, instead of
 * with the other Es — which is exactly the bug this function exists to
 * avoid. Never use this for anything that gets written to storage or a
 * save file.
 */
export function compareLocalized(a: string, b: string, lang: string): number {
  let collator = collators.get(lang);
  if (!collator) {
    collator = new Intl.Collator(lang);
    collators.set(lang, collator);
  }
  return collator.compare(a, b);
}
