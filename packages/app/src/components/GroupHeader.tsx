// Same active-entry treatment as CombatantRow's standalone row, per
// Main.dc.html: ember border-left, warmer background, a thin ring, and a
// warmer initiative colour. Kept in sync with CombatantRow's own constants
// (duplicated rather than shared — two small components, not worth a module
// just for four colour strings).
const ACTIVE_BORDER = "oklch(0.70 0.15 55)";
const ACTIVE_BG = "oklch(0.27 0.030 55)";
const ACTIVE_RING = "0 0 0 1px oklch(0.44 0.08 55)";
const ACTIVE_INITIATIVE_COLOR = "oklch(0.86 0.12 60)";

/** Header for a grouped entry — shared initiative, group name, member count.
 * `active` marks whether this group is the current turn's entry. */
export function GroupHeader({
  name,
  initiative,
  delayed = false,
  initiativeBeforeDelay = null,
  memberCount,
  active = false,
}: {
  name: string;
  initiative: number | null;
  /** A whole group can Delay — Delay is a property of the turn-order entry,
   * and a group is one entry — so the header carries the same struck-through
   * treatment a standalone row does (see StandaloneRow). */
  delayed?: boolean;
  initiativeBeforeDelay?: number | null;
  memberCount: number;
  active?: boolean;
}): React.ReactElement {
  return (
    <div
      data-active={active}
      style={{
        marginTop: "4px",
        display: "flex",
        alignItems: "center",
        gap: "8px",
        padding: "6px 10px 5px",
        borderRadius: "4px 4px 0 0",
        background: active ? ACTIVE_BG : "var(--info-bg)",
        borderLeft: `3px solid ${active ? ACTIVE_BORDER : "oklch(0.52 0.09 200)"}`,
        boxShadow: active ? ACTIVE_RING : "none",
      }}
    >
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "15px",
          fontWeight: 600,
          width: "24px",
          textAlign: "right",
          color: active ? ACTIVE_INITIATIVE_COLOR : "oklch(0.74 0.04 200)",
          textDecoration: delayed ? "line-through" : "none",
        }}
      >
        {initiative === null ? "—" : initiative}
      </div>
      {delayed && (
        <span style={{ fontSize: "10px", letterSpacing: "0.06em", color: "var(--info)" }}>delayed</span>
      )}
      {!delayed && initiativeBeforeDelay !== null && (
        <span style={{ fontSize: "11px", color: "var(--text-faint)", textDecoration: "line-through" }}>
          {initiativeBeforeDelay}
        </span>
      )}
      <span
        style={{
          fontSize: "12px",
          fontWeight: 600,
          letterSpacing: "0.03em",
          color: "oklch(0.84 0.05 200)",
        }}
      >
        {name.toUpperCase()}
      </span>
      <div style={{ flexGrow: 1 }} />
      <span style={{ fontSize: "10.5px", color: "oklch(0.68 0.03 200)" }}>{memberCount} combatants</span>
    </div>
  );
}
