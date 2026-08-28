/** NFD splits a letter from its combining marks; the range strips the marks.
 * Pure and locale-independent — never localeCompare, which is what made the
 * dataset non-deterministic once already. 41% of French creature names
 * carry accents nobody types at speed, so both the typed query and every
 * candidate name must be folded before comparison. */
export function fold(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/**
 * The name before its first parenthesised qualifier ("Jann (Génie)" ->
 * "Jann", "Quatoïde (Élémentaire, eau)" -> "Quatoïde"), trimmed. A name with
 * no qualifier is returned unchanged. A hit confined to the qualifier must
 * never outrank a hit on this — see rankMatches/searchCreatures.
 */
export function namePart(name: string): string {
  const idx = name.indexOf("(");
  return idx === -1 ? name : name.slice(0, idx).trim();
}
