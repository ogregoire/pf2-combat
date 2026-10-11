import { applyIwr, type Iwr } from "./damage.js";
import type { AppliedCondition } from "./conditions.js";

/** Petrified: "You become an object with … Hardness 8." */
export const PETRIFIED_HARDNESS = 8;

export interface DamageTaken {
  /** After immunities, weaknesses and resistances. */
  afterIwr: number;
  /** Taken off by Hardness — petrified's, or a blocking shield's. */
  hardness: number;
  /** Soaked up by temporary Hit Points. */
  fromTemp: number;
  /** What comes off the Hit Points. */
  fromHp: number;
}

/**
 * What a hit does, step by step (Player Core): immunities, weaknesses and
 * resistances first; then Hardness — a petrified creature's 8, or the
 * shield's when it Shield Blocks (the larger, never both: a petrified
 * creature can't act); then temporary Hit Points, lost first; the rest
 * comes off its Hit Points.
 */
export function damageTaken(
  target: { iwr?: Iwr | null; conditions: AppliedCondition[]; hp: { current: number; max: number; temp?: number } | null },
  amount: number,
  damageType: string,
  shieldHardness = 0,
): DamageTaken {
  const afterIwr = applyIwr(amount, damageType, target.iwr ?? null);
  const petrified = target.conditions.some((c) => c.slug === "petrified") ? PETRIFIED_HARDNESS : 0;
  const hardness = Math.min(afterIwr, Math.max(petrified, shieldHardness));
  const left = afterIwr - hardness;
  const fromTemp = Math.min(left, target.hp?.temp ?? 0);
  return { afterIwr, hardness, fromTemp, fromHp: left - fromTemp };
}

/** A shield's Hardness, from the name the creature's gear gives it
 * (Player Core and GM Core shields); a steel shield's 5 when unknown. */
export function shieldHardness(gear: string[]): number | null {
  const shield = gear.find((g) => /shield|buckler/i.test(g));
  if (!shield) return null;
  const s = shield.toLowerCase();
  if (s.includes("buckler") || s.includes("wooden")) return 3;
  if (s.includes("fortress")) return 6;
  const sturdy = /sturdy shield \((minor|lesser|moderate|greater|major|supreme)\)/.exec(s);
  if (sturdy) return { minor: 8, lesser: 10, moderate: 13, greater: 15, major: 17, supreme: 20 }[sturdy[1] as "minor"];
  return 5;
}
