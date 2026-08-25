import { format, useT } from "../i18n/index.js";
import { useEncounter } from "../state/store.js";

/** Advances the turn. Always enabled — per the brief, skipping outstanding
 * prompts must be a visible choice the GM makes, never a wall the app puts
 * up. The unacknowledged count is shown, not enforced. `actionsRemaining`
 * makes the button visually prominent once the active combatant is out of
 * actions — the natural moment to move on. */
export function NextButton({
  unacknowledgedCount,
  actionsRemaining,
}: {
  unacknowledgedCount: number;
  actionsRemaining?: number;
}): React.ReactElement {
  const nextTurn = useEncounter((s) => s.nextTurn);
  const t = useT();
  const prominent = actionsRemaining === 0;

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
          background: prominent ? "var(--accent-bg)" : "var(--panel-raised)",
          color: prominent ? "var(--accent-text)" : "var(--text)",
          fontWeight: prominent ? 600 : 400,
          cursor: "pointer",
        }}
      >
        {t("NEXT_COMBATANT_BUTTON")}
      </button>
      {unacknowledgedCount > 0 && (
        <div style={{ textAlign: "center", marginTop: "6px", fontSize: "11.5px", color: "var(--accent-text)" }}>
          {format(t("UNACKNOWLEDGED_COUNT"), { n: unacknowledgedCount })}
        </div>
      )}
    </div>
  );
}
