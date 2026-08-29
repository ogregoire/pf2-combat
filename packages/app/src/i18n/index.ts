import { useEncounter } from "../state/store.js";
import { STRINGS_EN, type StringKey } from "./en.js";
import { format } from "./format.js";
import { STRINGS_FR } from "./fr.js";

export { STRINGS_EN, STRINGS_FR, format };
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
  // "action"/"actions" is spelled the same in both languages, same rule as
  // ACTIONS_UNIT above — ActionCard's Use-button unit words.
  "USE_ACTION_UNIT_SINGULAR",
  "USE_ACTION_UNIT_PLURAL",
  // Language-neutral `{token}` templates, per the same rule as above.
  "PROMPT_NAME_VALUE",
  "PROMPT_NAME_DECREASE",
  // Damage type names spelled the same in both languages, per
  // data/i18n/fr/traits.json's own French trait names ("Force", "Mental",
  // "Poison") — not missed translations.
  "DAMAGE_TYPE_NAME_FORCE",
  "DAMAGE_TYPE_NAME_MENTAL",
  "DAMAGE_TYPE_NAME_POISON",
]);

/** Looks up chrome copy from the catalogue matching the store's current
 * `lang` — English by default, per the store. Component-local templating
 * (pluralisation, `{token}` substitution) is the caller's job via `format`;
 * this hook only picks the table. */
export function useT(): (key: StringKey) => string {
  const lang = useEncounter((s) => s.lang);
  const table = lang === "fr" ? STRINGS_FR : STRINGS_EN;
  return (key) => table[key];
}
