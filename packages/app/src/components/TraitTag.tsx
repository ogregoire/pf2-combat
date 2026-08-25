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
 */
export function TraitTag({ trait, glossary }: { trait: string; glossary: Map<string, TraitInfo> }): React.ReactElement {
  const { base } = splitTraitValue(trait);
  const info = glossary.get(base);

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
      {trait.replace(/-/g, " ").toUpperCase()}
    </span>
  );
}
