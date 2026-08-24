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
