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
 *
 * Spaces are stripped from both strings before comparing. French
 * alphabetisation convention treats a multi-word name as if it had no
 * spaces at all: "À terre" collates as "Àterre", landing between "Agrippé"
 * and "Aveuglé" — not, as `Intl.Collator`'s default weighting has it, at
 * the very front of the list, ahead of every unaccented word, because a
 * literal space sorts before any letter. `Intl.Collator`'s
 * `ignorePunctuation` option happens to fold spaces away too under the ICU
 * build Node ships, but that's an implementation detail of ICU's
 * "ignorable" set, not something the spec promises — and it would also
 * fold away hyphens and apostrophes, which nothing here asks for. Stripping
 * spaces ourselves keeps the behaviour to exactly what the GM's rule
 * names, independent of the engine. Hyphens and apostrophes are left alone:
 * they still go through the collator as ordinary characters, weighted
 * below letters (e.g. English "Off-Guard" already sorts where a reader
 * expects under that default weighting, so there's nothing to fix there).
 */
export function compareLocalized(a: string, b: string, lang: string): number {
  let collator = collators.get(lang);
  if (!collator) {
    collator = new Intl.Collator(lang);
    collators.set(lang, collator);
  }
  return collator.compare(a.replace(/\s+/g, ""), b.replace(/\s+/g, ""));
}
