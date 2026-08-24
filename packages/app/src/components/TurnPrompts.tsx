import { useEncounter } from "../state/store.js";
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
  const entries = useEncounter((s) => s.encounter.entries);
  const activeEntryIndex = useEncounter((s) => s.encounter.activeEntryIndex);
  const combatants = useEncounter((s) => s.encounter.combatants);
  const acknowledgedPrompts = useEncounter((s) => s.encounter.acknowledgedPrompts);
  const acknowledgePrompt = useEncounter((s) => s.acknowledgePrompt);

  const combatant = activeCombatantOf(entries, activeEntryIndex, combatants);
  if (!combatant) return null;

  const startPrompts = unacknowledged(
    promptsFor({ combatantId: combatant.id, conditions: combatant.conditions, timing: "start" }),
    acknowledgedPrompts,
  );
  const endPrompts = unacknowledged(
    promptsFor({ combatantId: combatant.id, conditions: combatant.conditions, timing: "end" }),
    acknowledgedPrompts,
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
      {startPrompts.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontSize: "10px", letterSpacing: "0.09em", color: "var(--text-faint)" }}>RESOLVE NOW</span>
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
              {startPrompts.length} TO RESOLVE
            </span>
          </div>
          {startPrompts.map((p) => (
            <PromptCard key={p.id} prompt={p} onAcknowledge={() => acknowledgePrompt(p.id)} />
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
            WAITING FOR END OF TURN — {endPrompts.length} ITEM{endPrompts.length === 1 ? "" : "S"}
          </span>
          {endPrompts.map((p) => (
            <PromptCard key={p.id} prompt={p} onAcknowledge={() => acknowledgePrompt(p.id)} />
          ))}
        </div>
      )}
    </div>
  );
}
