import { format, useT, type StringKey } from "../i18n/index.js";
import { actionPool } from "../rules/actions.js";
import { canDelayOrReady } from "../rules/conditions.js";
import { unrolledCount, useEncounter } from "../state/store.js";
import type { Combatant, Entry } from "../state/types.js";
import type { FetchFn } from "../data/catalog.js";
import { ConfirmButton } from "./ConfirmButton.js";
import { ReactionWatch } from "./ReactionWatch.js";
import { TurnPrompts } from "./TurnPrompts.js";

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
  const t = useT();
  const unrolled = useEncounter((s) => unrolledCount(s.encounter));
  if (unrolled === 0) return null;
  return (
    <span style={{ fontSize: "11.5px", color: "var(--danger)", textAlign: "center" }}>
      {format(t(unrolled === 1 ? "UNROLLED_NOTICE_SINGULAR" : "UNROLLED_NOTICE_PLURAL"), { n: unrolled })}
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
 * The narrow layout's pinned bottom bar carries Next only, so these stay
 * here, where both layouts reach them.
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
  // Confused and Fleeing: "you can't Delay or Ready". Any member of the
  // acting entry under either holds the whole entry back.
  const delayAllowed =
    activeEntry === undefined ||
    activeEntry.combatantIds.every((id) => canDelayOrReady(combatants[id]?.conditions ?? []));
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
          disabled={unrolled > 0 || !delayAllowed}
          title={unrolled > 0 ? t("DELAY_DISABLED_TITLE") : !delayAllowed ? t("DELAY_FORBIDDEN_TITLE") : undefined}
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
              background: canReturn ? "var(--turn-bg)" : "var(--panel-raised)",
              color: canReturn ? "var(--turn-text)" : "var(--text-faint)",
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

/** The right-pane turn manager — Main.dc.html's reactions plus
 * TurnAssistant.dc.html's start/end prompts, merged into one panel since
 * both describe the same sidebar. Reads the encounter store directly, same
 * as CombatantList. */
// Not here: the round counter heads the initiative list (EncounterScreen's
// CombatantListHeader), beside the order it counts; the action pips, Strike
// count and Next button sit in the centre pane's turn strip (TurnEconomy),
// with the actions they follow on from — and the narrow layout pins its own
// Next button to the bottom of every tab.
export function TurnManager({ fetchFn }: { fetchFn?: FetchFn } = {}): React.ReactElement {
  return (
    <div style={{ display: "flex", flexDirection: "column", flexGrow: 1, minHeight: 0, padding: "16px 14px", gap: "16px" }}>
      <TurnPrompts />

      <DelayControls />

      <ReactionWatch fetchFn={fetchFn} />

      <EncounterControls />
    </div>
  );
}
