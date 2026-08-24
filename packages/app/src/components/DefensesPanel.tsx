import type { Combatant } from "../state/types.js";

function Box({ label, value }: { label: string; value: React.ReactNode }): React.ReactElement {
  return (
    <div style={{ padding: "12px 16px", background: "var(--panel)" }}>
      <div style={{ fontSize: "10px", letterSpacing: "0.09em", color: "var(--text-faint)" }}>{label}</div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: "24px", fontWeight: 600, marginTop: "3px" }}>{value}</div>
    </div>
  );
}

/** Main.dc.html's defences strip: AC, HP, and the three saves. */
export function DefensesPanel({ combatant }: { combatant: Combatant }): React.ReactElement {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
        gap: "1px",
        background: "var(--border)",
        borderBottom: "1px solid var(--border)",
        flexShrink: 0,
      }}
    >
      <Box label="AC" value={combatant.ac ?? "—"} />
      <Box
        label="HIT POINTS"
        value={
          combatant.hp !== null ? (
            <>
              <span style={{ color: "var(--accent-text)" }}>{combatant.hp.current}</span>{" "}
              <span style={{ fontSize: "14px", color: "var(--text-faint)" }}>/ {combatant.hp.max}</span>
            </>
          ) : (
            "—"
          )
        }
      />
      <Box label="FORTITUDE" value={combatant.saves !== null ? combatant.saves.fortitude : "—"} />
      <Box label="REFLEX" value={combatant.saves !== null ? combatant.saves.reflex : "—"} />
      <Box label="WILL" value={combatant.saves !== null ? combatant.saves.will : "—"} />
    </div>
  );
}
