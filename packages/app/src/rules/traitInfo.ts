import { CONDITIONS, type ConditionSlug } from "./conditions.js";

/** Rules text looked up for a trait/keyword tag's hover tooltip, keyed by
 * its glossary or condition slug. */
export interface TraitInfo {
  name: string;
  description: string;
}

/**
 * A condition's display name for `lang` — French (from `glossary`, the
 * merged map `useTraitGlossary` builds, which already folds the French
 * conditions.json overlay in per-slug) when French is on and there's a
 * translation, `CONDITIONS[slug].name` (the rules layer's own English
 * name) otherwise. The one place both RowPopover (the condition picker/
 * chip) and CombatantRow (the row's own condition chips) resolve a
 * condition's name, so the two surfaces can never drift into showing two
 * different languages for the same applied condition. Gated on `lang`
 * rather than just falling through to whatever the glossary map holds, so
 * English rendering can never differ from `CONDITIONS[slug].name` even if
 * conditions.json's own English wording differs in some byte.
 */
export function conditionDisplayName(
  slug: ConditionSlug,
  glossary: Map<string, TraitInfo>,
  lang: "en" | "fr",
): string {
  if (lang !== "fr") return CONDITIONS[slug].name;
  return glossary.get(slug)?.name ?? CONDITIONS[slug].name;
}

/**
 * Turns an English glossary-ability name into the slug glossary.json (and
 * its French overlay, `data/i18n/fr/glossary.json`) key their entries by:
 * lowercased, apostrophes (straight or curly) dropped outright rather than
 * turned into a hyphen — `"(Ghost) Pyre's Memory"` -> `"ghost-pyres-memory"`,
 * matching how the source data itself is slugged — then every remaining run
 * of non `[a-z0-9]` characters collapsed to one hyphen, with the ends
 * trimmed. Verified (see trait-info.test.ts) against every one of the 447
 * live glossary.json entries: this reproduces each of their slugs exactly.
 *
 * Deliberately naive about parenthetical or numeric detail: a name like
 * `"Regeneration 20 (Deactivated by Acid or Fire)"` slugifies as one unit,
 * detail included, so it only matches a glossary entry sharing that exact
 * wording — it never strips the detail to fall back to a bare
 * "regeneration" entry. That under-matches on purpose: measured against the
 * real French creature data, the actions shaped like this are almost always
 * the ones that DO already carry their own French name in the creature
 * record (this function only ever gets consulted when that's missing), so
 * guessing which generic ability a decorated name is a variant of risks
 * attaching one creature's specific wording to a different creature's
 * ability, which is worse than just leaving it in English.
 */
export function slugifyAbilityName(name: string): string {
  return name
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * A creature action's display name for `lang`: the creature record's own
 * French name (`frName`) when present, then the glossary's French name for
 * that ability — looked up by slugifying `englishName` — when the record
 * has none, and `englishName` itself as the last resort. The same
 * three-source layering as `conditionDisplayName` below, extended by one
 * step: unlike a creature's own name or a Strike's, a creature RECORD
 * commonly leaves a shared, generic ability name untranslated (Rend, Grab,
 * Attack of Opportunity, Frightful Presence, ...) even though the glossary
 * — which exists precisely to hold that text once instead of in every
 * creature that uses it — has it. Measured against the real French data:
 * 1,540 of the 1,964 creature actions with a null French name resolve
 * through this fallback; the remaining 424 (mostly creature-specific
 * abilities the glossary was never going to have a generic entry for, e.g.
 * "Breath Weapon") reach `englishName`.
 *
 * `glossary` is the SAME merged slug -> { name, description } map
 * `useTraitGlossary` builds for the trait/condition tooltips, not a second
 * fetch of glossary.json — its `name` for a slug is already French-preferred
 * (`pick`'d against the French overlay one slug at a time, same as every
 * other source that map merges), falling back to the glossary's own English
 * text only when no French translation exists for that slug. That fallback
 * text and `englishName` should always coincide when the slug matches at
 * all — both trace back to the same canonical ability name — so this never
 * needs to ask which language the map handed back before using it.
 */
export function actionDisplayName(
  frName: string | null,
  englishName: string,
  glossary: Map<string, TraitInfo>,
  lang: "en" | "fr",
): string {
  if (lang !== "fr") return englishName;
  if (frName) return frName;
  return glossary.get(slugifyAbilityName(englishName))?.name ?? englishName;
}

/**
 * Splits a valued trait slug like `deadly-d10`, `range-120` or `reach-10`
 * into its base (`deadly`, `range`, `reach`) and the value (`d10`, `120`,
 * `10`) so the base can be looked up in the glossary while the tag itself
 * keeps showing the full slug. Narrow on purpose: only a trailing digit or
 * dice-die (`d\d+`) segment counts as a value, so slugs like `off-guard`
 * that merely contain a hyphen are left whole.
 */
export function splitTraitValue(slug: string): { base: string; value: string | null } {
  const m = /^([a-z]+)-(d?\d+)$/.exec(slug);
  if (m) return { base: m[1]!, value: m[2]! };
  return { base: slug, value: null };
}

/** Plain-text rendering of a glossary/condition description for use in a
 * native `title` attribute, which can't render markup. */
export function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
