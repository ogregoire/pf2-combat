import type { Action } from "@pf2/schema";
import { actionPool } from "../rules/actions.js";
import { compareStrings } from "../rules/compare.js";
import { useEncounter } from "../state/store.js";
import type { Combatant } from "../state/types.js";
import { ActionCard } from "./ActionCard.js";

function poolInputFor(combatant: Combatant): { slowed: number; stunned: number; quickened: boolean } {
  return {
    slowed: combatant.conditions.find((c) => c.slug === "slowed")?.value ?? 0,
    stunned: combatant.conditions.find((c) => c.slug === "stunned")?.value ?? 0,
    quickened: combatant.conditions.some((c) => c.slug === "quickened"),
  };
}

const COST_RANK: Record<Action["cost"], number> = {
  free: 0,
  "1": 1,
  "2": 2,
  "3": 3,
  reaction: 4,
  passive: 5,
};

/** Limited-use actions (a `frequency`) first, then by cost, then name —
 * the once-per-day ability shouldn't be buried under a pile of at-will
 * ones. `compareStrings`, never `localeCompare`, per the project rule. */
function compareActions(a: Action, b: Action): number {
  const aLimited = a.frequency !== null ? 0 : 1;
  const bLimited = b.frequency !== null ? 0 : 1;
  if (aLimited !== bLimited) return aLimited - bLimited;
  const costDiff = COST_RANK[a.cost] - COST_RANK[b.cost];
  if (costDiff !== 0) return costDiff;
  return compareStrings(a.name, b.name);
}

function costValue(cost: Action["cost"]): number {
  return cost === "1" || cost === "2" || cost === "3" ? Number(cost) : 0;
}

/** Main.dc.html's action list. Unaffordable actions render `disabled` but
 * stay visible — an indicator, never a blocker, since the pool tracked here
 * (slowed/stunned/quickened) isn't the only way a GM might justify a spend.
 * Passives (`cost: "passive"`) render in their own strip at the end,
 * matching the mockup's separate two-column passive block. */
export function ActionList({ combatant }: { combatant: Combatant }): React.ReactElement | null {
  const spendActions = useEncounter((s) => s.spendActions);
  if (combatant.actions.length === 0) return null;

  const pool = actionPool(poolInputFor(combatant));
  // Actions consumed so far this turn come out of the pool the conditions
  // allow — this is the piece that was never wired: the pool never moved
  // no matter what the GM pressed.
  const remaining = Math.max(0, pool.total - combatant.actionsSpent);
  const sorted = [...combatant.actions].sort(compareActions);
  const activatable = sorted.filter((a) => a.cost !== "passive");
  const passives = sorted.filter((a) => a.cost === "passive");

  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", gap: "10px", marginBottom: "8px" }}>
        <div style={{ fontSize: "11px", letterSpacing: "0.09em", textTransform: "uppercase", color: "var(--text-faint)" }}>
          Actions
        </div>
        <div style={{ fontSize: "11px", color: "var(--text-faint)" }}>limited use first · unaffordable dimmed</div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        {activatable.map((action) => {
          const cost = costValue(action.cost);
          const disabled = cost > remaining;
          return (
            <ActionCard
              key={action.name}
              action={action}
              disabled={disabled}
              needsLabel={disabled ? `NEEDS ${cost} — ${remaining} LEFT` : null}
              onUse={cost > 0 ? () => spendActions(combatant.id, cost) : undefined}
            />
          );
        })}

        {passives.length > 0 && (
          <div style={{ display: "flex", gap: "6px" }}>
            {passives.map((action) => (
              <ActionCard key={action.name} action={action} disabled={false} needsLabel={null} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
