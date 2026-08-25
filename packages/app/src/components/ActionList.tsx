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
 * Unaffordable actions render `disabled` but stay visible — an indicator,
 * never a blocker. Passives still render in their own strip at the end,
 * matching the mockup's separate two-column passive block; they're also
 * last in the cost order, so that isn't a contradiction. */
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
  const glossary = useTraitGlossary(fetchFn);

  if (combatant.actions.length === 0 && combatant.attacks.length === 0) return null;

  const pool = actionPool(poolInputFor(combatant));
  // Actions consumed so far this turn come out of the pool the conditions
  // allow — this is the piece that was never wired: the pool never moved
  // no matter what the GM pressed.
  const remaining = Math.max(0, pool.total - combatant.actionsSpent);
  const activeRung = Math.min(combatant.strikesMade, 2);

  const items = buildActionList(combatant.actions, combatant.attacks);
  const activatable = items.filter((i) => i.kind === "strike" || i.action.cost !== "passive");
  const passives = items.filter((i) => i.kind === "action" && i.action.cost === "passive");

  function renderChild(child: Action): React.ReactElement {
    const cost = costValue(child.cost);
    const disabled = cost > remaining;
    return (
      <ChildActionRow
        key={child.name}
        action={child}
        disabled={disabled}
        needsLabel={disabled ? `NEEDS ${cost} — ${remaining} LEFT` : null}
        onUse={cost > 0 ? () => spendActions(combatant.id, cost) : undefined}
        glossary={glossary}
      />
    );
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", gap: "10px", marginBottom: "8px" }}>
        <div style={{ fontSize: "11px", letterSpacing: "0.09em", textTransform: "uppercase", color: "var(--text-faint)" }}>
          Actions
        </div>
        <div style={{ fontSize: "11px", color: "var(--text-faint)" }}>3 actions first · limited use first · unaffordable dimmed</div>
      </div>

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
                {item.children.map(renderChild)}
              </div>
            );
          }

          const cost = costValue(item.action.cost);
          const disabled = cost > remaining;
          return (
            <div key={item.action.name} style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <ActionCard
                action={item.action}
                disabled={disabled}
                needsLabel={disabled ? `NEEDS ${cost} — ${remaining} LEFT` : null}
                onUse={cost > 0 ? () => spendActions(combatant.id, cost) : undefined}
                glossary={glossary}
              />
              {item.children.map(renderChild)}
            </div>
          );
        })}

        {passives.length > 0 && (
          <div style={{ display: "flex", gap: "6px" }}>
            {passives.map((item) =>
              item.kind === "action" ? (
                <ActionCard key={item.action.name} action={item.action} disabled={false} needsLabel={null} glossary={glossary} />
              ) : null,
            )}
          </div>
        )}
      </div>
    </div>
  );
}
