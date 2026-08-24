import { compareStrings } from "./compare.js";
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

const ALL_CHECKS: Selector[] = [
  "melee-attack", "ranged-attack", "fortitude", "reflex", "will", "perception", "skill",
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

export function conditionModifiers(
  applied: AppliedCondition[],
  selector: Selector,
): Modifier[] {
  const mods: Modifier[] = [];
  for (const c of applied) {
    const effect = CONDITIONS[c.slug].affects(c.value);
    if (effect === null) continue;
    if (!effect.selectors.includes(selector)) continue;
    mods.push(effect.mod);
  }
  return mods.sort((a, b) => compareStrings(a.source, b.source));
}
