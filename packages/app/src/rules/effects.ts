import { conditionModifiers, type AppliedCondition, type Expiry, type Selector } from "./conditions.js";
import type { Modifier, ModifierType } from "./modifiers.js";

/** What a bonus or penalty can apply to, as the GM picks it. */
export type EffectTarget =
  | "all" | "ac" | "saves" | "fortitude" | "reflex" | "will" | "perception" | "skills" | "attacks" | "spell-dc" | "damage";

export const EFFECT_TARGETS: EffectTarget[] = [
  "all", "ac", "saves", "fortitude", "reflex", "will", "perception", "skills", "attacks", "spell-dc", "damage",
];

const SELECTORS: Record<EffectTarget, Selector[]> = {
  all: ["attack", "ac", "saving-throw", "perception", "skill", "spell-attack", "spell-dc", "class-dc"],
  ac: ["ac"],
  saves: ["saving-throw"],
  fortitude: ["fortitude"],
  reflex: ["reflex"],
  will: ["will"],
  perception: ["perception"],
  skills: ["skill"],
  attacks: ["attack"],
  "spell-dc": ["spell-dc"],
  damage: ["damage"],
};

/**
 * A bonus or penalty that isn't a condition: cover, a raised shield, an
 * ally's buff, a GM's ad-hoc +1 — typed, so PF2's stacking applies to it
 * like to any other modifier, and timed when it ends on its own.
 */
export interface CustomEffect {
  id: string;
  /** As shown: a preset's name in the language it was added in, or the
   * GM's own. */
  label: string;
  value: number;
  type: ModifierType;
  targets: EffectTarget[];
  expires?: Expiry;
}

/** The common ones, one click each. `ends` "own-next-turn-start": a raised
 * shield lasts until the start of its bearer's next turn. */
export interface EffectPreset {
  key: string;
  value: number;
  type: ModifierType;
  targets: EffectTarget[];
  ends?: "own-next-turn-start" | "active-next-turn-start";
}

export const EFFECT_PRESETS: EffectPreset[] = [
  { key: "lesser-cover", value: 1, type: "circumstance", targets: ["ac"] },
  { key: "cover", value: 2, type: "circumstance", targets: ["ac"] },
  { key: "greater-cover", value: 4, type: "circumstance", targets: ["ac"] },
  { key: "raised-shield", value: 2, type: "circumstance", targets: ["ac"], ends: "own-next-turn-start" },
  { key: "bless", value: 1, type: "status", targets: ["attacks"] },
  { key: "courageous-anthem", value: 1, type: "status", targets: ["attacks", "damage"], ends: "active-next-turn-start" },
  { key: "heroism", value: 1, type: "status", targets: ["attacks", "perception", "saves", "skills"] },
];

/** What carries modifiers: a combatant's conditions and its effects. */
export interface ModifierSources {
  conditions: AppliedCondition[];
  effects?: CustomEffect[];
}

function effectModifiers(effects: CustomEffect[], wanted: readonly Selector[]): Modifier[] {
  return effects
    .filter((e) => e.targets.some((t) => SELECTORS[t].some((s) => wanted.includes(s))))
    .map((e) => ({ value: e.value, type: e.type, source: e.label }));
}

/** Every modifier on a check answering to `selectors`: the combatant's
 * conditions and its effects. Unresolved — stacking is `resolveModifiers`'
 * job. */
export function modifiersFor(source: ModifierSources, selectors: Selector | readonly Selector[]): Modifier[] {
  const wanted: readonly Selector[] = typeof selectors === "string" ? [selectors] : selectors;
  return [...conditionModifiers(source.conditions, wanted), ...effectModifiers(source.effects ?? [], wanted)];
}
