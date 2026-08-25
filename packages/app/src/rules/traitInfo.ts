/** Rules text looked up for a trait/keyword tag's hover tooltip, keyed by
 * its glossary or condition slug. */
export interface TraitInfo {
  name: string;
  description: string;
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
