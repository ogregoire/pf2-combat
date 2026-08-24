import { actionPool } from "../rules/actions.js";
import { useEncounter } from "../state/store.js";
import type { Combatant } from "../state/types.js";
import { ActionPips } from "./ActionPips.js";
import { NextButton } from "./NextButton.js";
import { ReactionWatch } from "./ReactionWatch.js";
import { TurnPrompts, activeCombatantOf, unacknowledgedCountFor } from "./TurnPrompts.js";

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
  const round = useEncounter((s) => s.encounter.round);
  const entries = useEncounter((s) => s.encounter.entries);
  const activeEntryIndex = useEncounter((s) => s.encounter.activeEntryIndex);
  const combatants = useEncounter((s) => s.encounter.combatants);
  const acknowledgedPrompts = useEncounter((s) => s.encounter.acknowledgedPrompts);

  const combatant = activeCombatantOf(entries, activeEntryIndex, combatants);
  const unacknowledgedCount = combatant ? unacknowledgedCountFor(combatant, acknowledgedPrompts) : 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", flexGrow: 1, minHeight: 0, padding: "16px 14px", gap: "16px" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: "10px", letterSpacing: "0.12em", color: "var(--text-faint)" }}>ROUND</div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: "40px", fontWeight: 600, lineHeight: 1.05, marginTop: "2px" }}>
          {round}
        </div>
      </div>

      {combatant && <ActionPips combatant={combatant} />}

      <TurnPrompts />

      {showNextButton && (
        <NextButton
          unacknowledgedCount={unacknowledgedCount}
          actionsRemaining={combatant ? remainingActionsFor(combatant) : undefined}
        />
      )}

      <ReactionWatch />
    </div>
  );
}
