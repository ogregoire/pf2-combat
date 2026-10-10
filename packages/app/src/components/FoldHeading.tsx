/** A section heading that folds its section: a chevron, the label and a
 * count, as one button carrying `aria-expanded`. Shared by the centre
 * pane's folded sections (standard actions, spells). */
export function FoldHeading({ label, open, onToggle, count }: { label: string; open: boolean; onToggle: () => void; count: number }): React.ReactElement {
  return (
    <button
      type="button"
      aria-expanded={open}
      onClick={onToggle}
      style={{
        fontFamily: "inherit",
        display: "flex",
        alignItems: "center",
        gap: "8px",
        width: "100%",
        padding: "4px 0",
        border: "none",
        background: "none",
        cursor: "pointer",
        fontSize: "11px",
        letterSpacing: "0.09em",
        textTransform: "uppercase",
        color: "var(--text-faint)",
        textAlign: "left",
      }}
    >
      <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true" style={{ transform: open ? "rotate(90deg)" : "none", flexShrink: 0 }}>
        <path d="M3 1.5 7 5 3 8.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {label}
      <span style={{ fontFamily: "var(--font-mono)", letterSpacing: 0 }}>{count}</span>
    </button>
  );
}
