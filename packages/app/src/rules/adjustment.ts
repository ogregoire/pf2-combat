import type { Combatant } from "../state/types.js";

/** GM Core's elite and weak adjustments (p. 116 elite, weak). */
export type AdjustmentKind = "elite" | "weak";

export interface Adjustment {
  kind: AdjustmentKind;
  /** The creature's printed level. An adjusted level can't be inverted
   * back to it — an elite level 2 is either a level 1 (+1) or a level 0
   * (+2) — so it is kept, and every revert works from it. */
  baseLevel: number;
}

/** Elite: +1 level, +2 from level −1 or 0. Weak: −1 level, −2 from level 1. */
export function adjustedLevel(baseLevel: number, kind: AdjustmentKind): number {
  if (kind === "elite") return baseLevel <= 0 ? baseLevel + 2 : baseLevel + 1;
  return baseLevel === 1 ? baseLevel - 2 : baseLevel - 1;
}

/** The Hit Points an adjustment adds (elite) or removes (weak), by the
 * creature's printed level. GM Core's weak table starts at level 1; a lower
 * creature takes the first row, the max HP floor in `applyAdjustment`
 * keeping it alive. */
export function hpDelta(baseLevel: number, kind: AdjustmentKind): number {
  if (kind === "elite") {
    if (baseLevel <= 1) return 10;
    if (baseLevel <= 4) return 15;
    if (baseLevel <= 19) return 20;
    return 30;
  }
  if (baseLevel <= 2) return -10;
  if (baseLevel <= 5) return -15;
  if (baseLevel <= 20) return -20;
  return -30;
}

/** Adds `n` to a damage formula's flat modifier: "1d8+5" +2 → "1d8+7",
 * "2d6" −2 → "2d6-2", "1d4-2" +2 → "1d4". A formula with no dice is a flat
 * number and changes the same way. */
export function addToFormula(formula: string, n: number): string {
  const trimmed = formula.replace(/\s+/g, "");
  if (/^-?\d+$/.test(trimmed)) return String(Number(trimmed) + n);
  const match = /^(.*?)([+-]\d+)$/.exec(trimmed);
  const dice = match ? match[1]! : trimmed;
  const flat = (match ? Number(match[2]) : 0) + n;
  if (flat === 0) return dice;
  return `${dice}${flat > 0 ? "+" : ""}${flat}`;
}

/**
 * Moves a creature's stats by one adjustment, in place: `sign` +1 applies
 * `kind`, −1 takes it back off. AC, saves, Perception (its initiative
 * modifier) and every Strike's attack bonus move by 2, and so does each
 * Strike's first damage entry; Hit Points by `hpDelta`, max and current
 * together so damage already taken stays taken. Level is not touched here
 * — the caller sets it from `baseLevel`, since it can't be stepped back.
 *
 * Not adjusted: DCs and damage inside ability text, which is free-form
 * prose with no structure to edit.
 */
export function shiftStats(c: Combatant, kind: AdjustmentKind, baseLevel: number, sign: 1 | -1): void {
  const step = (kind === "elite" ? 2 : -2) * sign;
  if (c.ac !== null) c.ac += step;
  if (c.saves !== null) {
    c.saves.fortitude += step;
    c.saves.reflex += step;
    c.saves.will += step;
  }
  if (c.initiativeModifier !== null) c.initiativeModifier += step;
  c.attacks = c.attacks.map((a) => ({
    ...a,
    bonus: a.bonus + step,
    damage: a.damage.map((d, i) => (i === 0 ? { ...d, formula: addToFormula(d.formula, step) } : d)),
  }));
  if (c.hp !== null) {
    const delta = hpDelta(baseLevel, kind) * sign;
    const max = Math.max(1, c.hp.max + delta);
    c.hp = { max, current: Math.min(max, Math.max(0, c.hp.current + delta)) };
  }
}
