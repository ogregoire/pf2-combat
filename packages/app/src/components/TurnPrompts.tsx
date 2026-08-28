import { useEncounter } from "../state/store.js";
import { format, useT } from "../i18n/index.js";
import { actionPool } from "../rules/actions.js";
import { promptsFor, type Prompt } from "../rules/prompts.js";
import type { Combatant, Entry } from "../state/types.js";
import { PromptCard } from "./PromptCard.js";

/** The active combatant — first member of the active entry. Groups share a
 * single turn, so this stands in for "whose turn it is" the same way the
 * store's own nextTurn() treats the whole entry as one turn. */
export function activeCombatantOf(
  entries: Entry[],
  activeEntryIndex: number,
  combatants: Record<string, Combatant>,
): Combatant | undefined {
  const entry = entries[activeEntryIndex];
  if (!entry) return undefined;
  const id = entry.combatantIds[0];
  if (id === undefined) return undefined;
  return combatants[id];
}

function unacknowledged(prompts: Prompt[], acknowledgedPrompts: string[]): Prompt[] {
  return prompts.filter((p) => !acknowledgedPrompts.includes(p.id));
}

/** Total outstanding prompts (start + end) for the active combatant — used
 * by NextButton to show the count without re-deriving promptsFor itself. */
export function unacknowledgedCountFor(combatant: Combatant, acknowledgedPrompts: string[]): number {
  const start = promptsFor({ combatantId: combatant.id, conditions: combatant.conditions, timing: "start" });
  const end = promptsFor({ combatantId: combatant.id, conditions: combatant.conditions, timing: "end" });
  return unacknowledged(start, acknowledgedPrompts).length + unacknowledged(end, acknowledgedPrompts).length;
}

/** The left column of TurnAssistant.dc.html: start-of-turn prompts that need
 * resolving now, and a preview of what's queued for end of turn. Timing is
 * derived entirely by the reviewed promptsFor — this component never
 * re-decides which conditions fire when. */
export function TurnPrompts(): React.ReactElement | null {
  const t = useT();
  const lang = useEncounter((s) => s.lang);
  const entries = useEncounter((s) => s.encounter.entries);
  const activeEntryIndex = useEncounter((s) => s.encounter.activeEntryIndex);
  const combatants = useEncounter((s) => s.encounter.combatants);
  const acknowledgedPrompts = useEncounter((s) => s.encounter.acknowledgedPrompts);
  const acknowledgePrompt = useEncounter((s) => s.acknowledgePrompt);
  const removeCondition = useEncounter((s) => s.removeCondition);
  const spendActions = useEncounter((s) => s.spendActions);

  const combatant = activeCombatantOf(entries, activeEntryIndex, combatants);
  if (!combatant) return null;

  /**
   * Acknowledging is just the GM's record that they've seen a prompt — it
   * drives `acknowledgedPrompts` (see below) and nothing else for an "end"
   * prompt like frightened's decrement, which is a rule that fires on its
   * own (nextTurn calls applyEndOfTurn — see store.ts) whether or not the
   * GM ever clicks the card. That used not to be true: this function used
   * to be the *only* place frightened's decrement happened, because nothing
   * else ever fired it. Now that nextTurn does, mutating the condition here
   * too would decrement it twice for one turn ending. Stunned's start-of-
   * turn action loss has no such automatic path yet, so it still applies
   * itself here — see the branch below.
   */
  const handleAcknowledge = (prompt: Prompt): void => {
    const applied = combatant.conditions.find((c) => c.slug === prompt.slug);
    if (applied) {
      // Removing stunned here alone used to hand the actions it just took
      // back — ActionPips/ActionList/NextButton all recompute actionPool
      // from `conditions` every render, so the moment stunned was gone the
      // pool read as if it never happened. spendActions makes the loss
      // permanent for this turn (via actionsSpent, reset at the next
      // start-of-turn like every other spend) before the condition that
      // caused it is cleared.
      if (prompt.timing === "start" && prompt.slug === "stunned") {
        const pool = actionPool({
          slowed: combatant.conditions.find((c) => c.slug === "slowed")?.value ?? 0,
          stunned: applied.value,
          quickened: combatant.conditions.some((c) => c.slug === "quickened"),
        });
        spendActions(combatant.id, pool.lost);
        removeCondition(combatant.id, "stunned");
      }
    }
    acknowledgePrompt(prompt.id);
  };

  const startPrompts = unacknowledged(
    promptsFor({ combatantId: combatant.id, conditions: combatant.conditions, timing: "start" }, lang),
    acknowledgedPrompts,
  );
  const endPrompts = unacknowledged(
    promptsFor({ combatantId: combatant.id, conditions: combatant.conditions, timing: "end" }, lang),
    acknowledgedPrompts,
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
      {startPrompts.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontSize: "10px", letterSpacing: "0.09em", color: "var(--text-faint)" }}>{t("RESOLVE_NOW_LABEL")}</span>
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "10.5px",
                fontWeight: 600,
                padding: "1px 6px",
                borderRadius: "2px",
                background: "var(--accent-bg)",
                color: "var(--accent-text)",
              }}
            >
              {format(t("TO_RESOLVE_BADGE"), { n: startPrompts.length })}
            </span>
          </div>
          {startPrompts.map((p) => (
            <PromptCard key={p.id} prompt={p} onAcknowledge={() => handleAcknowledge(p)} />
          ))}
        </div>
      )}

      {endPrompts.length > 0 && (
        <div
          style={{
            padding: "11px 13px",
            borderRadius: "5px",
            background: "var(--panel)",
            border: "1px dashed var(--border-strong)",
            display: "flex",
            flexDirection: "column",
            gap: "8px",
          }}
        >
          <span style={{ fontSize: "10px", letterSpacing: "0.09em", color: "var(--text-faint)" }}>
            {format(t("WAITING_END_OF_TURN"), {
              n: endPrompts.length,
              word: endPrompts.length === 1 ? t("ITEM_WORD_SINGULAR") : t("ITEM_WORD_PLURAL"),
            })}
          </span>
          {endPrompts.map((p) => (
            <PromptCard key={p.id} prompt={p} onAcknowledge={() => handleAcknowledge(p)} />
          ))}
        </div>
      )}
    </div>
  );
}
