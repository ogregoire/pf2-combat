import { format, useT, type StringKey } from "../i18n/index.js";
import { actionPool } from "../rules/actions.js";
import { unrolledCount, useEncounter } from "../state/store.js";
import type { Combatant, Entry } from "../state/types.js";
import type { FetchFn } from "../data/catalog.js";
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
          word: combatantCount === 1 ? t("COMBATANT_WORD_SINGULAR") : t("COMBATANT_WORD_PLURAL"),
        })}
        onConfirm={resetEncounter}
      />
    </div>
  );
}

/** `nextTurn` refuses to advance while anyone is unrolled (store.ts) — this
 * is the only place that says why, so the GM isn't left wondering why the
 * button did nothing. Its own component (not inlined in TurnManager) so
 * EncounterScreen's narrow layout can put the same message next to its
 * pinned NextButton, which is reachable from every tab — the guard has to
 * be explained everywhere a Next control is, not just on the Turn tab. */
export function UnrolledNotice(): React.ReactElement | null {
  const unrolled = useEncounter((s) => unrolledCount(s.encounter));
  if (unrolled === 0) return null;
  return (
    <span style={{ fontSize: "11.5px", color: "var(--danger)", textAlign: "center" }}>
      {unrolled} combatant{unrolled === 1 ? " has" : "s have"} no initiative
    </span>
  );
}

/** Shared by the two small controls below and the Return button's label —
 * an entry is a group or a lone combatant, and the GM knows it by whichever
 * name is on its row. */
function entryLabel(entry: Entry, combatants: Record<string, Combatant>, t: (key: StringKey) => string): string {
  return entry.groupName ?? combatants[entry.combatantIds[0] ?? ""]?.name ?? t("DEFAULT_COMBATANT_LABEL");
}

/**
 * Delay (Player Core p. 416) and its matching Return. Delay belongs beside
 * Next because it is the other thing a GM does at the top of a turn, and
 * because it *is* a turn advance — it hands play straight on.
 *
 * Return is per delayed entry rather than one button, since several
 * creatures can be delayed at once and they return independently. Each is
 * disabled unless there is some *other* entry currently acting for the
 * return to be triggered by (RAW: "triggered by the end of any other
 * creature's turn"), which is also the exact condition under which the store
 * action would refuse.
 *
 * Rendered outside TurnManager's `showNextButton` gate on purpose: that flag
 * exists because the narrow layout pins its own single Next button to the
 * bottom of the screen, and that pinned bar carries Next only. Gating these
 * on it as well would leave the narrow layout with no way to Delay at all.
 */
function DelayControls(): React.ReactElement | null {
  const t = useT();
  const entries = useEncounter((s) => s.encounter.entries);
  const activeEntryIndex = useEncounter((s) => s.encounter.activeEntryIndex);
  const combatants = useEncounter((s) => s.encounter.combatants);
  const delay = useEncounter((s) => s.delay);
  const returnFromDelay = useEncounter((s) => s.returnFromDelay);
  const unrolled = useEncounter((s) => unrolledCount(s.encounter));

  const activeEntry = entries[activeEntryIndex];
  const delayedEntries = entries.filter((e) => e.delayed);
  if (!activeEntry && delayedEntries.length === 0) return null;

  const smallButton: React.CSSProperties = {
    fontFamily: "inherit",
    fontSize: "11.5px",
    padding: "6px 10px",
    borderRadius: "4px",
    border: "1px solid var(--border)",
    background: "var(--panel-raised)",
    color: "var(--text)",
    cursor: "pointer",
  };

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", flexShrink: 0 }}>
      {/* Delaying hands the turn straight on, so the store refuses it while
         anyone is unrolled, exactly as nextTurn does. Disabled here for the
         same reason and in the same way Return is below — a live button
         over a refusal is a silent no-op, and UnrolledNotice is already on
         screen to say why. */}
      {activeEntry && !activeEntry.delayed && (
        <button
          type="button"
          onClick={() => delay(activeEntry.id)}
          disabled={unrolled > 0}
          title={unrolled > 0 ? t("DELAY_DISABLED_TITLE") : undefined}
          style={{
            ...smallButton,
            color: unrolled > 0 ? "var(--text-faint)" : "var(--text)",
            cursor: unrolled > 0 ? "default" : "pointer",
          }}
        >
          {t("DELAY_BUTTON")}
        </button>
      )}
      {delayedEntries.map((entry) => {
        const canReturn =
          activeEntry !== undefined && activeEntry.id !== entry.id && activeEntry.initiative !== null;
        return (
          <button
            key={entry.id}
            type="button"
            onClick={() => returnFromDelay(entry.id)}
            disabled={!canReturn}
            title={format(t("RETURN_FROM_DELAY_TITLE"), {
              entry: activeEntry ? entryLabel(activeEntry, combatants, t) : t("CURRENT_TURN_FALLBACK"),
            })}
            style={{
              ...smallButton,
              background: canReturn ? "var(--accent-bg)" : "var(--panel-raised)",
              color: canReturn ? "var(--accent-text)" : "var(--text-faint)",
              cursor: canReturn ? "pointer" : "default",
            }}
          >
            {format(t("RETURN_BUTTON"), { entry: entryLabel(entry, combatants, t) })}
          </button>
        );
      })}
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
export function TurnManager({
  showNextButton = true,
  fetchFn,
}: { showNextButton?: boolean; fetchFn?: FetchFn } = {}): React.ReactElement {
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

      {/* showNextButton also gates UnrolledNotice: on the narrow layout
         (showNextButton=false) the pinned bar's own Next button already
         carries this message (see EncounterScreen) — showing it here too
         would just repeat it while that Next button sits off-screen below. */}
      {showNextButton && (
        <>
          <NextButton
            unacknowledgedCount={unacknowledgedCount}
            actionsRemaining={combatant ? remainingActionsFor(combatant) : undefined}
          />
          <UnrolledNotice />
        </>
      )}

      <DelayControls />

      <ReactionWatch fetchFn={fetchFn} />

      <EncounterControls />
    </div>
  );
}
