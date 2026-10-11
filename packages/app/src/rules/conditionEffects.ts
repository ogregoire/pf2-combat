import {
  acOverride,
  CHECKS,
  conditionModifiers,
  skillChecks,
  strikeChecks,
  strikeDamageChecks,
  type AppliedCondition,
  type Attribute,
  type Selector,
} from "./conditions.js";
import { resolveModifiers } from "./modifiers.js";

/** What a modifier lands on, grouped the way a GM reads it: "all checks
 * and DCs" when it touches every one alike, else AC, the saves, skills by
 * attribute, Strikes by attribute, spells, Strength-based damage. */
export type EffectTarget =
  | { kind: "all" }
  | { kind: "ac" }
  | { kind: "saves" }
  | { kind: "save"; save: "fortitude" | "reflex" | "will" }
  | { kind: "perception" }
  | { kind: "skills"; attribute?: Attribute }
  | { kind: "attacks" }
  | { kind: "strikes"; attribute?: "str" | "dex" }
  | { kind: "spell" }
  | { kind: "spell-attack" }
  | { kind: "spell-dc" }
  | { kind: "damage" };

export interface Effect {
  target: EffectTarget;
  value: number;
  /** `value` is the score itself, set outright (petrified's AC 9), not a
   * modifier on it. */
  set?: true;
}

const ATTRIBUTES: Attribute[] = ["str", "dex", "con", "int", "wis", "cha"];
/** A skill of each attribute, to read that attribute's skills through. */
const SKILL_OF: Record<Attribute, string> = {
  str: "athletics", dex: "acrobatics", con: "lore", int: "arcana", wis: "medicine", cha: "deception",
};

/**
 * The exact numbers `conditions` put on every check the app shows, what
 * they imply included (unconscious brings off-guard), stacking resolved:
 * the same computation the stat block, the defences and the roll
 * assistant use, so a tooltip can never disagree with them.
 */
export function conditionEffects(conditions: AppliedCondition[]): Effect[] {
  const total = (selectors: readonly Selector[]): number =>
    resolveModifiers(conditionModifiers(conditions, selectors)).total;
  // Constitution has no skill; its row stands for nothing and stays 0.
  const skill = (a: Attribute): number => (a === "con" ? NaN : total(skillChecks(SKILL_OF[a])));
  const v = {
    ac: total(CHECKS.ac),
    fortitude: total(CHECKS.fortitude),
    reflex: total(CHECKS.reflex),
    will: total(CHECKS.will),
    perception: total(CHECKS.perception),
    str: total(strikeChecks({ kind: "melee", traits: [] })),
    dex: total(strikeChecks({ kind: "ranged", traits: [] })),
    spellAttack: total(CHECKS.spellAttack),
    spellDc: total(CHECKS.spellDc),
    damage: total(strikeDamageChecks({ kind: "melee", traits: [] })),
  };
  const skills = ATTRIBUTES.filter((a) => a !== "con").map((a) => ({ a, value: skill(a) }));
  const effects: Effect[] = [];
  const push = (target: EffectTarget, value: number): void => {
    if (value !== 0) effects.push({ target, value });
  };

  const setAc = acOverride(conditions);
  const checks = [v.ac, v.fortitude, v.reflex, v.will, v.perception, v.str, v.dex, v.spellAttack, v.spellDc, ...skills.map((s) => s.value)];
  if (setAc === null && checks.every((x) => x === checks[0]) && checks[0] !== 0) {
    push({ kind: "all" }, checks[0]!);
  } else {
    if (setAc !== null) effects.push({ target: { kind: "ac" }, value: setAc, set: true });
    else push({ kind: "ac" }, v.ac);
    if (v.fortitude === v.reflex && v.reflex === v.will) push({ kind: "saves" }, v.will);
    else for (const save of ["fortitude", "reflex", "will"] as const) push({ kind: "save", save }, v[save]);
    push({ kind: "perception" }, v.perception);
    if (skills.every((s) => s.value === skills[0]!.value)) push({ kind: "skills" }, skills[0]!.value);
    else for (const s of skills) push({ kind: "skills", attribute: s.a }, s.value);
    const attacksAlike = v.str === v.dex && v.dex === v.spellAttack;
    if (attacksAlike) push({ kind: "attacks" }, v.str);
    else if (v.str === v.dex) push({ kind: "strikes" }, v.str);
    else {
      push({ kind: "strikes", attribute: "str" }, v.str);
      push({ kind: "strikes", attribute: "dex" }, v.dex);
    }
    if (attacksAlike) push({ kind: "spell-dc" }, v.spellDc);
    else if (v.spellAttack === v.spellDc) push({ kind: "spell" }, v.spellDc);
    else {
      push({ kind: "spell-attack" }, v.spellAttack);
      push({ kind: "spell-dc" }, v.spellDc);
    }
  }
  push({ kind: "damage" }, v.damage);
  return effects;
}
