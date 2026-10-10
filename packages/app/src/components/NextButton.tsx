import { format, useT } from "../i18n/index.js";
import { useEncounter } from "../state/store.js";

/** Advances the turn. Always enabled — per the brief, skipping outstanding
 * prompts must be a visible choice the GM makes, never a wall the app puts
 * up. The unacknowledged count is shown, not enforced. `actionsRemaining`
 * makes the button visually prominent once the active combatant is out of
 * actions — the natural moment to move on. `compact` is the centre pane's
 * turn strip (TurnEconomy), beside the actions remaining: a row-height
 * button with the count beside it rather than a full-width block. */
export function NextButton({
  unacknowledgedCount,
  actionsRemaining,
  compact = false,
}: {
  unacknowledgedCount: number;
  actionsRemaining?: number;
  compact?: boolean;
}): React.ReactElement {
  const nextTurn = useEncounter((s) => s.nextTurn);
  const t = useT();
  const prominent = actionsRemaining === 0;

  return (
    <div style={compact ? { display: "flex", alignItems: "center", gap: "8px" } : undefined}>
      <button
        type="button"
        onClick={() => nextTurn()}
        style={{
          fontFamily: "inherit",
          width: compact ? undefined : "100%",
          padding: compact ? "8px 16px" : "16px 12px",
          borderRadius: "5px",
          border: `1px solid ${prominent ? "var(--turn)" : "var(--border-strong)"}`,
          background: prominent ? "var(--turn-bg)" : "var(--panel-raised)",
          color: "var(--text)",
          fontWeight: prominent ? 600 : 400,
          cursor: "pointer",
        }}
      >
        {t("NEXT_COMBATANT_BUTTON")}
      </button>
      {unacknowledgedCount > 0 && (
        <div style={{ textAlign: "center", marginTop: compact ? 0 : "6px", fontSize: "11.5px", color: "var(--turn-text)" }}>
          {format(t("UNACKNOWLEDGED_COUNT"), { n: unacknowledgedCount })}
        </div>
      )}
    </div>
  );
}
