import { compareStrings } from "./compare.js";

export type ModifierType = "status" | "circumstance" | "item" | "untyped";

export interface Modifier {
  value: number;
  type: ModifierType;
  source: string;
}

export interface ModifierResult {
  total: number;
  applied: Modifier[];
  suppressed: Modifier[];
}

const TYPED: ModifierType[] = ["status", "circumstance", "item"];

const order = (a: Modifier, b: Modifier): number =>
  compareStrings(a.type, b.type) || compareStrings(a.source, b.source);

/**
 * PF2 stacking: within status, circumstance and item, only the highest bonus
 * and the lowest penalty apply. Untyped modifiers all stack. `suppressed`
 * carries what was dropped so the UI can explain the number.
 */
export function resolveModifiers(mods: Modifier[]): ModifierResult {
  const applied: Modifier[] = [];
  const suppressed: Modifier[] = [];

  for (const type of TYPED) {
    const ofType = mods.filter((x) => x.type === type);
    const bonuses = ofType.filter((x) => x.value > 0);
    const penalties = ofType.filter((x) => x.value < 0);

    const best = bonuses.reduce<Modifier | null>(
      (acc, x) => (acc === null || x.value > acc.value ? x : acc),
      null,
    );
    const worst = penalties.reduce<Modifier | null>(
      (acc, x) => (acc === null || x.value < acc.value ? x : acc),
      null,
    );

    for (const x of ofType) {
      if (x === best || x === worst) applied.push(x);
      else suppressed.push(x);
    }
  }

  for (const x of mods) {
    if (x.type === "untyped" && x.value !== 0) applied.push(x);
  }

  applied.sort(order);
  suppressed.sort(order);

  return {
    total: applied.reduce((sum, x) => sum + x.value, 0),
    applied,
    suppressed,
  };
}
