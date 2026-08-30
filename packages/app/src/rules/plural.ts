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
 * Genitive/locative prepositions that introduce a `X <preposition> Y`
 * compound whose head noun is `X`, not `Y` — "Garde du corps" pluralises
 * "Garde", never "corps". "de la"/"de l'"/"à la"/"à l'" need no separate
 * entry: they're matched by the bare "de"/"à" here, which lands on the
 * same split point regardless of what follows.
 */
const PREPOSITIONS = new Set(["de", "du", "des", "à", "au", "aux", "en"]);

/**
 * Index into `words` of the first preposition that has at least one word
 * before it (so there's a head noun to pluralise) — matched as a whole
 * word, case-insensitive. -1 if there's no such preposition.
 */
function firstPrepositionIndex(words: string[]): number {
  for (let i = 1; i < words.length; i++) {
    if (PREPOSITIONS.has(words[i]!.toLowerCase())) return i;
  }
  return -1;
}

/**
 * French pluralisation is genuinely irregular; this only ever renders a
 * button label (AddCombatants's Add button), not prose, so predictable
 * beats clever. A parenthesised qualifier ("Jann (Génie)") is carved off
 * first and left untouched.
 *
 * The head noun is not reliably the LAST word either: in a
 * "X <preposition> Y" compound the head is X, the word right before the
 * preposition ("Garde du corps" -> "Gardes du corps", "Policier à cheval"
 * -> "Policiers à cheval", "Blasphémateur de Zon-Kuthon" -> plural
 * "Blasphémateurs", the deity's name never touched). Absent such a
 * preposition, the rule set is applied to the LAST word instead, which is
 * correct for plain names and adjective-final ones ("Chauves-souris
 * crépitante" -> "crépitantes", the adjective, since "Chauves-souris" is
 * already the (invariant) head noun).
 */
function pluralizeFrenchName(name: string): string {
  const parenIndex = name.indexOf("(");
  const core = parenIndex === -1 ? name : name.slice(0, parenIndex);
  const suffix = parenIndex === -1 ? "" : name.slice(parenIndex);

  // Alternating word/whitespace tokens that reconstruct `core` exactly via
  // `.join("")` — unlike a plain `.split(/\s+/)`, this never produces an
  // empty token, so a trailing space before a parenthetical (e.g. "Jann "
  // before "(Génie)") round-trips untouched.
  const tokens = core.match(/\S+|\s+/g);
  if (tokens === null) return name;
  const wordTokenIndices = tokens.reduce<number[]>((acc, token, i) => {
    if (!/^\s/.test(token)) acc.push(i);
    return acc;
  }, []);
  if (wordTokenIndices.length === 0) return name;
  const words = wordTokenIndices.map((i) => tokens[i]!);

  const prepIndex = firstPrepositionIndex(words);
  const targetWordIndex = prepIndex === -1 ? words.length - 1 : prepIndex - 1;
  const targetTokenIndex = wordTokenIndices[targetWordIndex]!;

  tokens[targetTokenIndex] = pluralizeFrenchWord(tokens[targetTokenIndex]!);
  return tokens.join("") + suffix;
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
