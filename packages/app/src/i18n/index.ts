import { useEncounter } from "../state/store.js";
import { STRINGS_EN, type StringKey } from "./en.js";
import { STRINGS_FR } from "./fr.js";

export { STRINGS_EN, STRINGS_FR };
export type { StringKey };

/**
 * Keys deliberately identical between languages — either because the
 * remaster's own French vocabulary keeps the English loanword (REMASTER_BADGE,
 * ROUND_LABEL — see `lang/fr.json`'s `Duration.round`/`Publication.Remaster`),
 * or because the word is spelled the same in both languages (Initiative,
 * Actions) or is a bare abbreviation not worth inventing a French variant for
 * (Init). The "no key equals its English" test in i18n-catalogue.test.ts
 * exempts exactly this set — anything else identical is a translation that
 * was never done.
 */
export const ALLOWLIST = new Set<StringKey>([
  "LABEL_INITIATIVE",
  "ACTIONS_HEADING",
  "ACTIONS_UNIT",
  "REMASTER_BADGE",
  "GROUP_INITIATIVE_PLACEHOLDER",
  "ROUND_LABEL",
]);

/** Substitutes `{token}` placeholders in a catalogue string with `vars`.
 * Named rather than positional so a French translation can reorder words
 * around the substitution freely. An unmatched token is left as-is rather
 * than silently dropped, so a typo'd token name fails loudly in the UI. */
export function format(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (whole, key: string) => (key in vars ? String(vars[key]) : whole));
}

/** Looks up chrome copy from the catalogue matching the store's current
 * `lang` — English by default, per the store. Component-local templating
 * (pluralisation, `{token}` substitution) is the caller's job via `format`;
 * this hook only picks the table. */
export function useT(): (key: StringKey) => string {
  const lang = useEncounter((s) => s.lang);
  const table = lang === "fr" ? STRINGS_FR : STRINGS_EN;
  return (key) => table[key];
}
