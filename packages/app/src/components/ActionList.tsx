import { useState } from "react";
import type { Action } from "@pf2/schema";
import { actionPool } from "../rules/actions.js";
import { buildActionList } from "../rules/actionLayout.js";
import { useEncounter } from "../state/store.js";
import { useTraitGlossary } from "../hooks/useTraitGlossary.js";
import type { FetchFn } from "../data/catalog.js";
import type { Combatant } from "../state/types.js";
import { ActionCard, ChildActionRow } from "./ActionCard.js";
import { StrikeCard } from "./StrikeCard.js";

function poolInputFor(combatant: Combatant): { slowed: number; stunned: number; quickened: boolean } {
  return {
    slowed: combatant.conditions.find((c) => c.slug === "slowed")?.value ?? 0,
    stunned: combatant.conditions.find((c) => c.slug === "stunned")?.value ?? 0,
    quickened: combatant.conditions.some((c) => c.slug === "quickened"),
  };
}

function costValue(cost: "1" | "2" | "3" | "free" | "reaction" | "passive"): number {
  return cost === "1" || cost === "2" || cost === "3" ? Number(cost) : 0;
}

/** Main.dc.html's action list, with Strikes folded in — gathering them into
 * their own separate panel made it "totally ineffective" at the table, and
 * a Strike costs 1 action just like anything else, so it takes the same
 * cost pip and the same place in the cost-descending order (3 actions -> 2
 * -> 1 -> free -> reaction -> passive; limited-use first within a cost).
 * Unaffordable actions render `disabled`, folded to their header line, but
 * stay visible — an indicator,
 * never a blocker. Passives lead the list instead of trailing it, each on
 * its own line and folded to its name — they're reference material the GM
 * reads once, not something pressed during a turn, so they must not sit
 * between the actions that are. */
export function ActionList({
  combatant,
  selectedAttackIndex,
  onSelectAttack,
  fetchFn,
}: {
  combatant: Combatant;
  selectedAttackIndex: number | null;
  onSelectAttack: (index: number) => void;
  fetchFn?: FetchFn;
}): React.ReactElement | null {
  const spendActions = useEncounter((s) => s.spendActions);
  const setReactionSpent = useEncounter((s) => s.setReactionSpent);
  const glossary = useTraitGlossary(fetchFn);
  // Which ability the GM has pressed. Selection reveals its Use button;
  // pressing the card itself never spends (see ActionCard).
  const [selected, setSelected] = useState<string | null>(null);

  if (combatant.actions.length === 0 && combatant.attacks.length === 0) return null;

  const pool = actionPool(poolInputFor(combatant));
  // Actions consumed so far this turn come out of the pool the conditions
  // allow — this is the piece that was never wired: the pool never moved
  // no matter what the GM pressed.
  const remaining = Math.max(0, pool.total - combatant.actionsSpent);
  const activeRung = Math.min(combatant.strikesMade, 2);

  /**
   * What pressing an ability's Use button costs, and whether it can be paid.
   *
   * A reaction draws on the single reaction a creature has per round, not on
   * the three-action pool, so it needs its own affordability check and its own
   * spend — without one, a reaction rendered a card with no Use button at all
   * and `setReactionSpent` was only reachable from ReactionWatch's "Spent".
   * RAW (Player Core, Reactions in Encounters): you gain your reaction when
   * your first turn begins, and you lose an unused reaction at the start of
   * your next turn but immediately regain one — i.e. one per round, refreshed
   * at the start of the turn, which is exactly what `advanceTurn` already
   * does. Whether a creature may react *before* its first turn is explicitly
   * the GM's call, so nothing here blocks that.
   *
   * A free action has no pool and no per-round cap, so there is nothing to
   * spend and it gets no Use button (`onUse: undefined`).
   */
  function spendSpec(action: Action): { disabled: boolean; onUse: (() => void) | undefined } {
    if (action.cost === "reaction") {
      return {
        disabled: combatant.reactionSpent,
        onUse: () => setReactionSpent(combatant.id, true),
      };
    }
    const cost = costValue(action.cost);
    if (cost === 0) return { disabled: false, onUse: undefined };
    return { disabled: cost > remaining, onUse: () => spendActions(combatant.id, cost) };
  }

  const items = buildActionList(combatant.actions, combatant.attacks);
  const activatable = items.filter((i) => i.kind === "strike" || i.action.cost !== "passive");
  const passives = items.filter((i) => i.kind === "action" && i.action.cost === "passive");

  function renderChild(child: Action, parentName?: string): React.ReactElement {
    const { disabled, onUse } = spendSpec(child);
    return (
      <ChildActionRow
        key={child.name}
        action={child}
        disabled={disabled}
        selected={selected === child.name}
        onSelect={() => setSelected((prev) => (prev === child.name ? null : child.name))}
        onUse={onUse}
        glossary={glossary}
        parentName={parentName}
      />
    );
  }

  return (
    <div>
      <div style={{ fontSize: "11px", letterSpacing: "0.09em", textTransform: "uppercase", color: "var(--text-faint)", marginBottom: "8px" }}>
        Actions
      </div>

      {passives.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginBottom: "6px" }}>
          {passives.map((item) =>
            item.kind === "action" ? (
              <ActionCard key={item.action.name} action={item.action} disabled={false} glossary={glossary} />
            ) : null,
          )}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        {activatable.map((item) => {
          if (item.kind === "strike") {
            return (
              <div key={`strike-${item.index}`} style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <StrikeCard
                  attack={item.attack}
                  selected={selectedAttackIndex === item.index}
                  activeRung={activeRung}
                  onSelect={() => onSelectAttack(item.index)}
                  glossary={glossary}
                />
                {item.children.map((child) => renderChild(child, item.attack.name))}
              </div>
            );
          }

          const { disabled, onUse } = spendSpec(item.action);
          return (
            <div key={item.action.name} style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <ActionCard
                action={item.action}
                disabled={disabled}
                selected={selected === item.action.name}
                onSelect={() =>
                  setSelected((prev) => (prev === item.action.name ? null : item.action.name))
                }
                onUse={onUse}
                glossary={glossary}
              />
              {item.children.map((child) => renderChild(child, item.action.name))}
            </div>
          );
        })}

      </div>
    </div>
  );
}
