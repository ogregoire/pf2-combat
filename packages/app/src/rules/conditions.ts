import { compareStrings } from "./compare.js";
import { rollFormula, type Rng } from "./dice.js";
import type { Modifier } from "./modifiers.js";

export type Selector =
  | "melee-attack"
  | "ranged-attack"
  | "ac"
  | "fortitude"
  | "reflex"
  | "will"
  | "perception"
  | "skill";

export type ConditionSlug =
  | "off-guard" | "frightened" | "sickened" | "clumsy" | "enfeebled"
  | "stupefied" | "drained" | "slowed" | "stunned" | "quickened"
  | "prone" | "grabbed" | "restrained" | "immobilized" | "blinded"
  | "dazzled" | "deafened" | "fatigued" | "doomed" | "dying"
  | "wounded" | "persistent-damage";

export interface ConditionDef {
  slug: ConditionSlug;
  name: string;
  valued: boolean;
  /** Selectors this condition penalises, given its value. */
  affects: (value: number) => { selectors: Selector[]; mod: Modifier } | null;
  startOfTurn?: "reduce-actions" | "recovery-check";
  endOfTurn?: "decrement" | "persistent-damage";
  implies?: ConditionSlug[];
}

// "All your checks and DCs" (data/conditions.json, frightened/sickened) — AC
// is a DC, so it belongs here. An earlier review praised its omission as
// correct; that was wrong (see task C3).
const ALL_CHECKS: Selector[] = [
  "melee-attack", "ranged-attack", "ac", "fortitude", "reflex", "will", "perception", "skill",
];

const status = (value: number, source: string): Modifier => ({
  value: -value,
  type: "status",
  source,
});

const circumstance = (value: number, source: string): Modifier => ({
  value: -value,
  type: "circumstance",
  source,
});

const def = (d: ConditionDef): ConditionDef => d;

export const CONDITIONS: Record<ConditionSlug, ConditionDef> = {
  "off-guard": def({
    slug: "off-guard", name: "Off-Guard", valued: false,
    affects: () => ({ selectors: ["ac"], mod: circumstance(2, "off-guard") }),
  }),
  frightened: def({
    slug: "frightened", name: "Frightened", valued: true,
    affects: (v) => ({ selectors: ALL_CHECKS, mod: status(v, `frightened ${v}`) }),
    endOfTurn: "decrement",
  }),
  sickened: def({
    slug: "sickened", name: "Sickened", valued: true,
    affects: (v) => ({ selectors: ALL_CHECKS, mod: status(v, `sickened ${v}`) }),
  }),
  clumsy: def({
    slug: "clumsy", name: "Clumsy", valued: true,
    // PF2e clumsy is Dex-based, which includes AC, Reflex, and ranged
    // attack rolls (per data/conditions.json) — not melee.
    affects: (v) => ({
      selectors: ["ac", "reflex", "ranged-attack"],
      mod: status(v, `clumsy ${v}`),
    }),
  }),
  enfeebled: def({
    slug: "enfeebled", name: "Enfeebled", valued: true,
    // PF2e enfeebled is Str-based, which includes Strength-based melee
    // attack rolls (per data/conditions.json) — not ranged.
    affects: (v) => ({ selectors: ["melee-attack"], mod: status(v, `enfeebled ${v}`) }),
  }),
  stupefied: def({
    slug: "stupefied", name: "Stupefied", valued: true,
    // PF2e stupefied applies to Int/Wis/Cha-based checks and DCs, which
    // includes Will saves AND Perception checks (Perception uses Wisdom).
    // The brief's reference implementation scoped this to ["will"] only,
    // dropping Perception — corrected here; see task-5-report.md.
    affects: (v) => ({ selectors: ["will", "perception"], mod: status(v, `stupefied ${v}`) }),
  }),
  drained: def({
    slug: "drained", name: "Drained", valued: true,
    affects: (v) => ({ selectors: ["fortitude"], mod: status(v, `drained ${v}`) }),
  }),
  slowed: def({
    slug: "slowed", name: "Slowed", valued: true,
    affects: () => null, startOfTurn: "reduce-actions",
  }),
  stunned: def({
    slug: "stunned", name: "Stunned", valued: true,
    affects: () => null, startOfTurn: "reduce-actions",
  }),
  quickened: def({
    slug: "quickened", name: "Quickened", valued: false, affects: () => null,
  }),
  prone: def({
    slug: "prone", name: "Prone", valued: false,
    affects: () => ({
      selectors: ["melee-attack", "ranged-attack"],
      mod: circumstance(2, "prone"),
    }),
    implies: ["off-guard"],
  }),
  grabbed: def({
    slug: "grabbed", name: "Grabbed", valued: false, affects: () => null,
    implies: ["off-guard", "immobilized"],
  }),
  restrained: def({
    slug: "restrained", name: "Restrained", valued: false, affects: () => null,
    implies: ["off-guard", "immobilized"],
  }),
  immobilized: def({
    slug: "immobilized", name: "Immobilized", valued: false, affects: () => null,
  }),
  blinded: def({
    slug: "blinded", name: "Blinded", valued: false, affects: () => null,
    // No `implies: ["off-guard"]` here, deliberately. Blinded's own text in
    // data/conditions.json never mentions off-guard; a blinded creature
    // reaches off-guard only because it can't see, so its targets are
    // undetected to it, and you're off-guard to undetected creatures. That
    // link runs through the visibility system, which this app does not
    // model — and it doesn't always hold (a creature with a precise
    // non-visual sense, e.g. tremorsense, would not be off-guard at all).
    // Don't shortcut it back in; let the GM apply off-guard explicitly.
  }),
  dazzled: def({ slug: "dazzled", name: "Dazzled", valued: false, affects: () => null }),
  deafened: def({ slug: "deafened", name: "Deafened", valued: false, affects: () => null }),
  fatigued: def({
    slug: "fatigued", name: "Fatigued", valued: false,
    affects: () => ({
      selectors: ["ac", "fortitude", "reflex", "will"],
      mod: status(1, "fatigued"),
    }),
  }),
  doomed: def({ slug: "doomed", name: "Doomed", valued: true, affects: () => null }),
  dying: def({
    slug: "dying", name: "Dying", valued: true, affects: () => null,
    startOfTurn: "recovery-check",
  }),
  wounded: def({ slug: "wounded", name: "Wounded", valued: true, affects: () => null }),
  "persistent-damage": def({
    // data/conditions.json marks this isValued: false — not an oversight.
    // Persistent damage carries dice (1d6, 2d4, ...), which an integer
    // `value` can't express. The dice live in AppliedCondition.formula
    // instead; see below.
    slug: "persistent-damage", name: "Persistent Damage", valued: false,
    affects: () => null, endOfTurn: "persistent-damage",
  }),
};

export interface AppliedCondition {
  slug: ConditionSlug;
  value: number;
  /** Dice formula for persistent damage (e.g. "2d6") — see the ruling above. */
  formula?: string;
}

/**
 * `implies` is declared on prone/grabbed/restrained but was never consumed —
 * their own condition text states off-guard (and, for grabbed/restrained,
 * immobilized) without a value ever applying it. This expands the applied
 * set with those implied conditions (synthetic, value 0 — every implied
 * condition in the curated set is unvalued) before modifiers are computed,
 * so the effect actually lands wherever conditions are read. Idempotent: a
 * condition already present (explicit or already implied) is never added
 * twice, so off-guard's -2 circumstance penalty doesn't stack with itself
 * when e.g. both prone and grabbed apply.
 */
function expandImplied(applied: AppliedCondition[]): AppliedCondition[] {
  const present = new Set(applied.map((c) => c.slug));
  const expanded = [...applied];
  for (const c of applied) {
    for (const implied of CONDITIONS[c.slug].implies ?? []) {
      if (present.has(implied)) continue;
      present.add(implied);
      expanded.push({ slug: implied, value: 0 });
    }
  }
  return expanded;
}

export function conditionModifiers(
  applied: AppliedCondition[],
  selector: Selector,
): Modifier[] {
  const mods: Modifier[] = [];
  for (const c of expandImplied(applied)) {
    const effect = CONDITIONS[c.slug].affects(c.value);
    if (effect === null) continue;
    if (!effect.selectors.includes(selector)) continue;
    mods.push(effect.mod);
  }
  return mods.sort((a, b) => compareStrings(a.source, b.source));
}

/**
 * Fires every condition's `endOfTurn` hook once, for the combatant whose
 * turn just ended. `startOfTurn`/`endOfTurn` have been declared on
 * ConditionDef since before this function existed, but nothing ever read
 * them — frightened never ticked down on its own, and persistent damage
 * never rolled. This is the first reader; the caller (nextTurn in
 * store.ts) is the first of what Task 8 says will be two call sites (Delay
 * is the second, firing this immediately instead of waiting for nextTurn).
 *
 * "decrement" lowers the value by 1 and drops the condition once it would
 * reach 0 — matches the existing GM-facing "Frightened decreases" prompt
 * text in prompts.ts. "persistent-damage" rolls `c.formula` and adds it to
 * the running total; the condition itself is NOT removed here, since ending
 * persistent damage takes its own DC 15 flat check (see prompts.ts) that
 * this hook doesn't model. Every other condition passes through unchanged.
 *
 * `rng` is injectable (defaults to Math.random via rollFormula) so callers —
 * and tests — can get a deterministic persistentDamage instead of only
 * knowing it was ">= 0".
 */
export function applyEndOfTurn(
  applied: AppliedCondition[],
  rng?: Rng,
): { conditions: AppliedCondition[]; persistentDamage: number } {
  const conditions: AppliedCondition[] = [];
  let persistentDamage = 0;

  for (const c of applied) {
    const hook = CONDITIONS[c.slug].endOfTurn;

    if (hook === "decrement") {
      const next = c.value - 1;
      if (next > 0) conditions.push({ ...c, value: next });
      continue; // next <= 0: condition ends, dropped from the result
    }

    if (hook === "persistent-damage") {
      const rolled = rollFormula(c.formula, rng);
      if (rolled === null) {
        // A formula that's missing or doesn't parse as NdM(+/-K) can't just
        // deal 0 damage silently — that would look identical to "rolled a
        // 0", which persistent damage dice can never actually produce. It
        // also can't throw and crash the turn over what's fundamentally bad
        // input data (a condition added without a formula, or a typo). So:
        // trace it loudly (console.warn — there's no GM-facing error
        // channel this deep in the rules layer) and contribute nothing.
        console.warn(
          `applyEndOfTurn: persistent-damage condition has an unrollable formula: ${JSON.stringify(c.formula)}`,
        );
      } else {
        persistentDamage += rolled;
      }
      conditions.push(c);
      continue;
    }

    conditions.push(c);
  }

  return { conditions, persistentDamage };
}
