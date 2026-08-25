import { useEncounter } from "../state/store.js";
import { splitTraitValue, stripHtml, type TraitInfo } from "../rules/traitInfo.js";

/**
 * One trait/keyword chip. `whiteSpace: nowrap` on the tag plus `flexWrap:
 * wrap` on its container (set by callers) is the whole fix for the tags
 * shrinking into two-line chips: the row now wraps as a group instead, and
 * no individual tag ever breaks mid-word.
 *
 * Hovering shows the trait's rules text, looked up in `glossary` by its base
 * slug (`deadly-d10` -> `deadly`) so a valued trait still resolves — the
 * value itself stays in the visible label, untouched. A trait with no entry
 * gets no `title` at all, never an empty tooltip.
 *
 * The label itself only ever switches to the glossary's `name` when French
 * is on AND that entry has one — every other case (English, or French with
 * no French name for this slug) keeps the original slug-derived label
 * unchanged, so English rendering is untouched byte-for-byte.
 */
export function TraitTag({ trait, glossary }: { trait: string; glossary: Map<string, TraitInfo> }): React.ReactElement {
  const lang = useEncounter((s) => s.lang);
  const { base, value } = splitTraitValue(trait);
  const info = glossary.get(base);
  const label =
    lang === "fr" && info?.name ? `${info.name}${value ? ` ${value}` : ""}` : trait.replace(/-/g, " ");

  return (
    <span
      title={info ? stripHtml(info.description) : undefined}
      style={{
        fontSize: "10px",
        letterSpacing: "0.05em",
        padding: "2px 6px",
        borderRadius: "2px",
        background: "var(--border)",
        color: "var(--text-dim)",
        whiteSpace: "nowrap",
      }}
    >
      {label.toUpperCase()}
    </span>
  );
}
