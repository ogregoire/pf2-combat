import { useEncounter } from "../state/store.js";

/** Advances the turn. Always enabled — per the brief, skipping outstanding
 * prompts must be a visible choice the GM makes, never a wall the app puts
 * up. The unacknowledged count is shown, not enforced. */
export function NextButton({ unacknowledgedCount }: { unacknowledgedCount: number }): React.ReactElement {
  const nextTurn = useEncounter((s) => s.nextTurn);

  return (
    <div>
      <button
        type="button"
        onClick={() => nextTurn()}
        style={{
          fontFamily: "inherit",
          width: "100%",
          padding: "16px 12px",
          borderRadius: "5px",
          border: "1px solid var(--border-strong)",
          background: "var(--panel-raised)",
          color: "var(--text)",
          cursor: "pointer",
        }}
      >
        Next combatant
      </button>
      {unacknowledgedCount > 0 && (
        <div style={{ textAlign: "center", marginTop: "6px", fontSize: "11.5px", color: "var(--accent-text)" }}>
          {unacknowledgedCount} unacknowledged
        </div>
      )}
    </div>
  );
}
