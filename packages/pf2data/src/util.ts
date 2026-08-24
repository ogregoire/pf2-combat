/**
 * Locale-independent string comparator for every sort that ends up in emitted
 * output. `String.prototype.localeCompare` follows the environment's ICU
 * locale (e.g. `LC_ALL=da_DK.UTF-8` orders "a" after "z"), which makes
 * output order depend on the machine running the tool rather than on the
 * pinned upstream data. Plain code-unit comparison is deterministic
 * everywhere Node runs.
 */
export function compareStrings(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}
