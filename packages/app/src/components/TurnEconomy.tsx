import { useT } from "../i18n/index.js";
import { useEncounter } from "../state/store.js";
import type { Combatant } from "../state/types.js";
import { ActionPips } from "./ActionPips.js";
import { NextButton } from "./NextButton.js";
import { UnrolledNotice, remainingActionsFor } from "./TurnManager.js";
import { unacknowledgedCountFor } from "./TurnPrompts.js";

/** The active combatant's turn economy, in the centre pane under its name:
 * the actions it has left and the Strikes it has made this turn (which set
 * the roll assistant's multiple attack penalty). Both are spent from the
 * action list right below, so they sit with it rather than in the turn
 * manager. The reset control is resetStrikes' only UI entry point — the GM
 * needs it the moment a miscounted Strike would keep feeding the wrong MAP
 * rung to the roll assistant; small and secondary, a correction.
 *
 * The Next button ends the strip, right beside the actions it is the
 * natural follow-up to (it lights up once none are left), with the notice
 * saying why it refuses while someone has no initiative. Desktop only: the
 * narrow layout pins its own Next button to the bottom of every tab. */
export function TurnEconomy({ combatant, narrow }: { combatant: Combatant; narrow: boolean }): React.ReactElement {
  const t = useT();
  const resetStrikes = useEncounter((s) => s.resetStrikes);
  const acknowledgedPrompts = useEncounter((s) => s.encounter.acknowledgedPrompts);
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        flexWrap: "wrap",
        gap: "10px 24px",
        padding: narrow ? "10px 14px" : "10px 24px",
        borderBottom: "1px solid var(--border)",
        flexShrink: 0,
      }}
    >
      <ActionPips combatant={combatant} />
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }} data-testid="strikes-this-turn">
        <span style={{ fontSize: "10px", letterSpacing: "0.09em", color: "var(--text-faint)" }}>
          {t("STRIKES_THIS_TURN_LABEL")}
        </span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: "13px", fontWeight: 600 }}>{combatant.strikesMade}</span>
        <button
          type="button"
          aria-label={t("RESET_STRIKES_ARIA")}
          onClick={() => resetStrikes(combatant.id)}
          style={{
            fontFamily: "inherit",
            fontSize: "10px",
            padding: "1px 6px",
            borderRadius: "3px",
            border: "1px solid var(--border)",
            background: "var(--panel-raised)",
            color: "var(--text-faint)",
            cursor: "pointer",
          }}
        >
          {t("RESET_BUTTON")}
        </button>
      </div>
      {!narrow && (
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "10px" }}>
          <UnrolledNotice />
          <NextButton
            compact
            unacknowledgedCount={unacknowledgedCountFor(combatant, acknowledgedPrompts)}
            actionsRemaining={remainingActionsFor(combatant)}
          />
        </div>
      )}
    </div>
  );
}
