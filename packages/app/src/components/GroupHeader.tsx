/** Header for a grouped entry — shared initiative, group name, member count. */
export function GroupHeader({
  name,
  initiative,
  memberCount,
}: {
  name: string;
  initiative: number;
  memberCount: number;
}): React.ReactElement {
  return (
    <div
      style={{
        marginTop: "4px",
        display: "flex",
        alignItems: "center",
        gap: "8px",
        padding: "6px 10px 5px",
        borderRadius: "4px 4px 0 0",
        background: "var(--info-bg)",
        borderLeft: "3px solid oklch(0.52 0.09 200)",
      }}
    >
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "15px",
          fontWeight: 600,
          width: "24px",
          textAlign: "right",
          color: "oklch(0.74 0.04 200)",
        }}
      >
        {initiative}
      </div>
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
