export type PluralLang = "en" | "fr";

/**
 * French pluralisation applied to the LAST word of `word` (the caller has
 * already isolated the word this rule set treats), by exactly four rules:
 * a name already ending in -s, -x or -z is unchanged; -al becomes -aux;
 * -eau or -eu gains an -x; anything else gains a plain -s. This is
 * deliberately not full French morphology (no -ail exception list, no
 * adjective agreement) — see plural.ts's module doc.
 */
function pluralizeFrenchWord(word: string): string {
  const lower = word.toLowerCase();
  if (lower.endsWith("s") || lower.endsWith("x") || lower.endsWith("z")) return word;
  if (lower.endsWith("al")) return `${word.slice(0, -2)}aux`;
  if (lower.endsWith("eau") || lower.endsWith("eu")) return `${word}x`;
  return `${word}s`;
}

/**
 * French pluralisation is genuinely irregular; this only ever renders a
 * button label (AddCombatants's Add button), not prose, so predictable
 * beats clever. The head noun is not reliably first in French ("Troll des
 * glaces" pluralises the troll, "Chauves-souris crépitante" the adjective),
 * so the rule set below is applied to the LAST word of the name, and a
 * parenthesised qualifier ("Jann (Génie)") is carved off first and left
 * untouched.
 */
function pluralizeFrenchName(name: string): string {
  const parenIndex = name.indexOf("(");
  const core = parenIndex === -1 ? name : name.slice(0, parenIndex);
  const suffix = parenIndex === -1 ? "" : name.slice(parenIndex);

  const wordMatch = core.match(/(\S+)(\s*)$/);
  if (wordMatch === null) return name;
  const [, word, trailingSpace] = wordMatch as [string, string, string];
  const beforeWord = core.slice(0, core.length - word.length - trailingSpace.length);

  return `${beforeWord}${pluralizeFrenchWord(word)}${trailingSpace}${suffix}`;
}

/**
 * `name` pluralised for a `quantity`, per `lang` — English keeps its
 * existing unconditional "+s" (never touched by the French rules below,
 * so English behaviour cannot move), French applies `pluralizeFrenchName`.
 * Singular (`quantity === 1`) always returns `name` unchanged, in both
 * languages.
 */
export function pluralize(name: string, quantity: number, lang: PluralLang): string {
  if (quantity === 1) return name;
  return lang === "fr" ? pluralizeFrenchName(name) : `${name}s`;
}
