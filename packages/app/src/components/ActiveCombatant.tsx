import { useState } from "react";
import { resolveAttacks, resolveCreatureName } from "../data/i18nOverlay.js";
import { useCombatantI18n } from "../hooks/useCombatantI18n.js";
import { useEncounter } from "../state/store.js";
import type { FetchFn } from "../data/catalog.js";
import { StatBlockHeader } from "./StatBlockHeader.js";
import { DefensesPanel } from "./DefensesPanel.js";
import { ActionList } from "./ActionList.js";
import { RollAssistant } from "./RollAssistant.js";
import { activeCombatantOf } from "./TurnPrompts.js";

/** The centre pane of Main.dc.html (stat block, defences, strikes, actions)
 * combined with the roll assistant column of TurnAssistant.dc.html, the way
 * TurnManager already merges its own two source mockups. The active
 * combatant is derived the same way TurnPrompts derives it: the first
 * member of the active entry. `addCombatant`/`addMany` now preserve the
 * active entry by identity across a re-sort, so this no longer needs a
 * workaround for combatants added mid-combat. */
export function ActiveCombatant({ fetchFn }: { fetchFn?: FetchFn } = {}): React.ReactElement | null {
  const entries = useEncounter((s) => s.encounter.entries);
  const activeEntryIndex = useEncounter((s) => s.encounter.activeEntryIndex);
  const combatants = useEncounter((s) => s.encounter.combatants);
  const targetId = useEncounter((s) => s.encounter.targetId);
  const lang = useEncounter((s) => s.lang);

  const combatant = activeCombatantOf(entries, activeEntryIndex, combatants);
  const [selectedAttackIndex, setSelectedAttackIndex] = useState<number | null>(null);
  const rawTarget = targetId !== null ? combatants[targetId] : undefined;
  // Both called unconditionally (Rules of Hooks) — results only used once
  // `combatant` is confirmed non-null below.
  const combatantI18n = useCombatantI18n(combatant ?? { i18n: null, creatureId: undefined });
  const targetI18n = useCombatantI18n(rawTarget ?? { i18n: null, creatureId: undefined });

  if (!combatant) return null;

  // Resolved to French so the roll assistant's TARGET panel never names the
  // one combatant on screen still in English while everything around it is
  // French — targeting is the single most-used action during someone
  // else's turn.
  const target = rawTarget
    ? { ...rawTarget, name: resolveCreatureName(rawTarget.name, targetI18n, lang) }
    : undefined;
  // Resolved to French so the roll assistant's own Strike name (picked by
  // index, not by identity, from the same list ActionList/StrikeCard
  // render) never falls back to English on its own.
  const attacks = resolveAttacks(combatant.attacks, combatantI18n, lang);
  const attack = selectedAttackIndex !== null ? attacks[selectedAttackIndex] : undefined;

  return (
    <div style={{ display: "flex", flexGrow: 1, minWidth: 0, minHeight: 0 }}>
      <div style={{ flexGrow: 1, minWidth: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <StatBlockHeader combatant={combatant} />
        <DefensesPanel combatant={combatant} />
        <div style={{ flexGrow: 1, minHeight: 0, overflowY: "auto", padding: "16px 24px", display: "flex", flexDirection: "column", gap: "18px" }}>
          <ActionList
            combatant={combatant}
            selectedAttackIndex={selectedAttackIndex}
            onSelectAttack={setSelectedAttackIndex}
            fetchFn={fetchFn}
          />
        </div>
      </div>

      <div style={{ width: "380px", flexShrink: 0, borderLeft: "1px solid var(--border)", padding: "16px 14px", overflowY: "auto" }}>
        <RollAssistant combatant={combatant} target={target} attack={attack} />
      </div>
    </div>
  );
}
