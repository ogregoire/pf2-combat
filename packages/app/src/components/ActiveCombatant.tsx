import { useState } from "react";
import { useEncounter } from "../state/store.js";
import { StatBlockHeader } from "./StatBlockHeader.js";
import { DefensesPanel } from "./DefensesPanel.js";
import { AttacksPanel } from "./AttacksPanel.js";
import { ActionList } from "./ActionList.js";
import { RollAssistant } from "./RollAssistant.js";
import type { Combatant, Entry } from "../state/types.js";

/** The turn-order entry to run — same rule TurnPrompts uses (the first
 * member of the entry at `activeEntryIndex`), except it skips past the
 * entry currently selected as `targetId`. An active combatant is never its
 * own target, and `addCombatant` re-sorts `entries` by initiative on every
 * call, so `activeEntryIndex` is a plain array position: adding a
 * higher-initiative combatant after the encounter's first entry silently
 * shifts what position 0 points at. Walking forward from `activeEntryIndex`
 * for the first non-target entry keeps this panel showing the combatant
 * actually taking the turn instead of whoever they're aiming at. */
function activeAttackerOf(
  entries: Entry[],
  activeEntryIndex: number,
  combatants: Record<string, Combatant>,
  targetId: string | null,
): Combatant | undefined {
  for (let offset = 0; offset < entries.length; offset++) {
    const entry = entries[(activeEntryIndex + offset) % entries.length];
    const id = entry?.combatantIds[0];
    if (id !== undefined && id !== targetId) return combatants[id];
  }
  return undefined;
}

/** The centre pane of Main.dc.html (stat block, defences, strikes, actions)
 * combined with the roll assistant column of TurnAssistant.dc.html, the way
 * TurnManager already merges its own two source mockups. */
export function ActiveCombatant(): React.ReactElement | null {
  const entries = useEncounter((s) => s.encounter.entries);
  const activeEntryIndex = useEncounter((s) => s.encounter.activeEntryIndex);
  const combatants = useEncounter((s) => s.encounter.combatants);
  const targetId = useEncounter((s) => s.encounter.targetId);

  const combatant = activeAttackerOf(entries, activeEntryIndex, combatants, targetId);
  const [selectedAttackIndex, setSelectedAttackIndex] = useState<number | null>(null);

  if (!combatant) return null;

  const target = targetId !== null ? combatants[targetId] : undefined;
  const attack = selectedAttackIndex !== null ? combatant.attacks[selectedAttackIndex] : undefined;

  return (
    <div style={{ display: "flex", flexGrow: 1, minWidth: 0, minHeight: 0 }}>
      <div style={{ flexGrow: 1, minWidth: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <StatBlockHeader combatant={combatant} />
        <DefensesPanel combatant={combatant} />
        <div style={{ flexGrow: 1, minHeight: 0, overflowY: "auto", padding: "16px 24px", display: "flex", flexDirection: "column", gap: "18px" }}>
          <AttacksPanel combatant={combatant} selectedIndex={selectedAttackIndex} onSelect={setSelectedAttackIndex} />
          <ActionList combatant={combatant} />
        </div>
      </div>

      <div style={{ width: "380px", flexShrink: 0, borderLeft: "1px solid var(--border)", padding: "16px 14px", overflowY: "auto" }}>
        <RollAssistant combatant={combatant} target={target} attack={attack} />
      </div>
    </div>
  );
}
