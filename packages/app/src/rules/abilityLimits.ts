import type { Action } from "@pf2/schema";

/**
 * How often an ability can be used, from its stated frequency ("1/day",
 * "1/round", "3/day", "1/hour"…). A per-round or per-turn use comes back at
 * the start of the creature's turn; anything longer — a minute is ten
 * rounds, longer than most fights — doesn't come back during the encounter.
 */
export interface AbilityLimit {
  max: number;
  /** Upstream's period: "day", "round", "turn", or an ISO duration
   * ("PT1H", "PT10M", "PT1M", "P1W"…). */
  per: string;
  resetsEachTurn: boolean;
}

export function abilityLimit(action: Pick<Action, "frequency">): AbilityLimit | null {
  if (!action.frequency) return null;
  const { max, per } = action.frequency;
  return { max, per, resetsEachTurn: per === "round" || per === "turn" };
}

/**
 * The dice (or number) of rounds an ability is spent for once used —
 * "can't use Breath Weapon again for 1d4 rounds", 289 abilities in the
 * dataset, most written as an inline roll (`[[/gmr 1d4 #Recharge Breath
 * Weapon]]{1d4 rounds}`). Null for an ability with no recharge.
 */
export function rechargeFormula(description: string): string | null {
  const m = /can(?:'|’)t use [^.]{0,80}? again for (?:\[\[\/\w*r\s+([0-9d+\s-]+?)(?:\s*#[^\]]*)?\]\]|(\d+) rounds?\b)/.exec(description);
  if (!m) return null;
  return (m[1] ?? m[2])!.replace(/\s+/g, "");
}
