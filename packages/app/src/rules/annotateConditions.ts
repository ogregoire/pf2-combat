import { CONDITIONS, type ConditionSlug } from "./conditions.js";

/** Conditions whose name is also an everyday word ("a hidden door", "un
 * coffre caché"): marked only when capitalised, the way the rules text
 * names a condition. */
const AMBIGUOUS = new Set<ConditionSlug>([
  "hidden", "concealed", "observed", "undetected", "unnoticed", "broken", "controlled", "invisible",
]);

/** Older stat blocks' names for a condition the Remaster renamed. */
const LEGACY_NAMES: Partial<Record<ConditionSlug, string[]>> = { "off-guard": ["flat-footed"] };

const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const escapeAttr = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * Marks every condition a rules text names — "Frightened 2", "off-guard",
 * "effrayé 1" — with hover text (`data-hover`, see HoverCard) from `tooltipFor`, given its value
 * when the text states one. Only text between tags is read, so markup and
 * attributes are never touched. `nameOf` gives a condition's name in the
 * text's language; French matches feminine and plural forms too
 * ("effrayée", "effrayés").
 */
export function annotateConditions(
  html: string,
  lang: "en" | "fr",
  nameOf: (slug: ConditionSlug) => string,
  tooltipFor: (slug: ConditionSlug, value: number | null) => string,
): string {
  const bySpelling = new Map<string, ConditionSlug>();
  for (const slug of Object.keys(CONDITIONS) as ConditionSlug[]) {
    const names = [nameOf(slug), ...(lang === "en" ? (LEGACY_NAMES[slug] ?? []) : [])];
    for (const n of names) bySpelling.set(n.toLowerCase(), slug);
  }
  // Longest first, so "pris au dépourvu" wins over any shorter name inside it.
  const spellings = [...bySpelling.keys()].sort((a, b) => b.length - a.length);
  if (spellings.length === 0) return html;
  const suffix = lang === "fr" ? "(?:e|s|es)?" : "";
  const pattern = new RegExp(
    `(?<![\\p{L}\\p{N}-])(${spellings.map(escapeRegExp).join("|")})${suffix}(?:[  ](\\d+))?(?![\\p{L}\\p{N}])`,
    "giu",
  );
  const lower = (s: string): string => s.toLowerCase();
  return html
    .split(/(<[^>]*>)/)
    .map((part) => {
      if (part.startsWith("<")) return part;
      return part.replace(pattern, (match, name: string, value: string | undefined) => {
        const slug = bySpelling.get(lower(name));
        if (!slug) return match;
        if (AMBIGUOUS.has(slug) && name[0] === lower(name[0]!)) return match;
        const title = tooltipFor(slug, value === undefined ? null : Number(value));
        return `<span class="condition-ref" data-condition="${slug}" data-hover="${escapeAttr(title)}" style="text-decoration: underline dotted; text-underline-offset: 2px; cursor: help">${match}</span>`;
      });
    })
    .join("");
}
