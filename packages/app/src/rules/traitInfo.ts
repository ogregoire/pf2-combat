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
