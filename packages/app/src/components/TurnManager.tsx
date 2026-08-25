import { format, useT } from "../i18n/index.js";
import { actionPool } from "../rules/actions.js";
import { useEncounter } from "../state/store.js";
import type { Combatant } from "../state/types.js";
import { ActionPips } from "./ActionPips.js";
import { ConfirmButton } from "./ConfirmButton.js";
import { NextButton } from "./NextButton.js";
import { ReactionWatch } from "./ReactionWatch.js";
import { TurnPrompts, activeCombatantOf, unacknowledgedCountFor } from "./TurnPrompts.js";

/** Two of the app's three destructive clearing actions live here, next to
 * the round counter whose state they affect — "clear enemies" keeps the
 * fight running (round, turn order, PCs untouched), "reset encounter" starts
 * it over from round 1 but leaves the player roster alone (the third action,
 * "clear players", lives in PartyManager next to the roster it empties).
 * Each confirmation names exactly what it's about to lose. */
function EncounterControls(): React.ReactElement {
  const enemyCount = useEncounter(
    (s) => Object.values(s.encounter.combatants).filter((c) => c.kind === "creature").length,
  );
  const combatantCount = useEncounter((s) => Object.keys(s.encounter.combatants).length);
  const clearEnemies = useEncounter((s) => s.clearEnemies);
  const resetEncounter = useEncounter((s) => s.resetEncounter);
  const t = useT();

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", flexShrink: 0 }}>
      <ConfirmButton
        label={t("CLEAR_ENEMIES_LABEL")}
        confirmMessage={format(t("CLEAR_ENEMIES_CONFIRM"), {
          n: enemyCount,
          word: enemyCount === 1 ? t("ENEMY_SINGULAR") : t("ENEMY_PLURAL"),
        })}
        onConfirm={clearEnemies}
        disabled={enemyCount === 0}
      />
      <ConfirmButton
        label={t("RESET_ENCOUNTER_LABEL")}
        confirmMessage={format(t("RESET_ENCOUNTER_CONFIRM"), {
          n: combatantCount,
          word: `${t("COMBATANT_WORD")}${combatantCount === 1 ? "" : "s"}`,
        })}
        onConfirm={resetEncounter}
      />
    </div>
  );
}

/** Same pool computation ActionPips/ActionList already make from a
 * combatant's conditions — duplicated locally (as those two already
 * duplicate it from each other) rather than adding a new shared module for
 * three call sites. Exported so EncounterScreen's narrow layout can drive
 * its own pinned NextButton with the same number. */
export function remainingActionsFor(combatant: Combatant): number {
  const pool = actionPool({
    slowed: combatant.conditions.find((c) => c.slug === "slowed")?.value ?? 0,
    stunned: combatant.conditions.find((c) => c.slug === "stunned")?.value ?? 0,
    quickened: combatant.conditions.some((c) => c.slug === "quickened"),
  });
  return Math.max(0, pool.total - combatant.actionsSpent);
}

/** The right-pane turn manager — Main.dc.html's round/pips/Next/reactions
 * plus TurnAssistant.dc.html's start/end prompts, merged into one panel
 * since both describe the same sidebar. Reads the encounter store directly,
 * same as CombatantList. `showNextButton` defaults to true (desktop,
 * unchanged); EncounterScreen's narrow layout passes false because it pins
 * its own single NextButton to the bottom of the screen instead — without
 * this, the Turn tab would show two Next buttons at once. */
export function TurnManager({ showNextButton = true }: { showNextButton?: boolean } = {}): React.ReactElement {
  const t = useT();
  const round = useEncounter((s) => s.encounter.round);
  const entries = useEncounter((s) => s.encounter.entries);
  const activeEntryIndex = useEncounter((s) => s.encounter.activeEntryIndex);
  const combatants = useEncounter((s) => s.encounter.combatants);
  const acknowledgedPrompts = useEncounter((s) => s.encounter.acknowledgedPrompts);
  const resetStrikes = useEncounter((s) => s.resetStrikes);

  const combatant = activeCombatantOf(entries, activeEntryIndex, combatants);
  const unacknowledgedCount = combatant ? unacknowledgedCountFor(combatant, acknowledgedPrompts) : 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", flexGrow: 1, minHeight: 0, padding: "16px 14px", gap: "16px" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: "10px", letterSpacing: "0.12em", color: "var(--text-faint)" }}>{t("ROUND_LABEL")}</div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: "40px", fontWeight: 600, lineHeight: 1.05, marginTop: "2px" }}>
          {round}
        </div>
      </div>

      {combatant && <ActionPips combatant={combatant} />}

      {/* Turn-economy state belongs together with the action pips, not
         buried in the actions list. The reset control lives here too — the
         old ActionList.tsx chip that carried it is gone, so this is now
         resetStrikes' only UI entry point; the GM needs it the moment a
         miscounted Strike would otherwise keep feeding the wrong MAP rung
         to the roll assistant. Small and secondary (a correction, not a
         primary action), never bigger than the count itself. */}
      {combatant && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }} data-testid="strikes-this-turn">
          <span style={{ fontSize: "10px", letterSpacing: "0.09em", color: "var(--text-faint)" }}>
            {t("STRIKES_THIS_TURN_LABEL")}
          </span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "13px", fontWeight: 600 }}>
            {combatant.strikesMade}
          </span>
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
      )}

      <TurnPrompts />

      {showNextButton && (
        <NextButton
          unacknowledgedCount={unacknowledgedCount}
          actionsRemaining={combatant ? remainingActionsFor(combatant) : undefined}
        />
      )}

      <ReactionWatch />

      <EncounterControls />
    </div>
  );
}
