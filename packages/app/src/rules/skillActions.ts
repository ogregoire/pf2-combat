import type { Creature } from "@pf2/schema";
import { CHECKS, skillChecks, type Attribute } from "./conditions.js";
import { modifiersFor, type ModifierSources } from "./effects.js";
import { mapPenalty } from "./map.js";
import { resolveModifiers, type Modifier } from "./modifiers.js";

export type Defense = "fortitude" | "reflex" | "will" | "perception";

/** The skill actions rolled against a target's defence DC (Player Core):
 * the skill used, the defence, and whether the attack trait puts it under
 * the multiple attack penalty. */
export const SKILL_ACTIONS: { slug: string; skill: string; defense: Defense; attack: boolean }[] = [
  { slug: "demoralize", skill: "intimidation", defense: "will", attack: false },
  { slug: "feint", skill: "deception", defense: "perception", attack: false },
  { slug: "create-a-diversion", skill: "deception", defense: "perception", attack: false },
  { slug: "trip", skill: "athletics", defense: "reflex", attack: true },
  { slug: "grapple", skill: "athletics", defense: "fortitude", attack: true },
  { slug: "shove", skill: "athletics", defense: "fortitude", attack: true },
  { slug: "disarm", skill: "athletics", defense: "reflex", attack: true },
  { slug: "reposition", skill: "athletics", defense: "fortitude", attack: true },
  { slug: "tumble-through", skill: "acrobatics", defense: "reflex", attack: false },
  { slug: "steal", skill: "thievery", defense: "perception", attack: false },
];

const SKILL_ATTRIBUTE: Record<string, Attribute> = {
  intimidation: "cha", deception: "cha", athletics: "str", acrobatics: "dex", thievery: "dex",
};

/** A defence DC as it stands: 10 + the save (or Perception) with its
 * modifiers. A PC's Perception is its initiative modifier, the app's only
 * record of it; null when unknown. */
export function defenseDc(target: ModifierSources & { saves: { fortitude: number; reflex: number; will: number } | null; initiativeModifier?: number | null }, defense: Defense): { dc: number; mods: Modifier[] } | null {
  const base = defense === "perception" ? (target.initiativeModifier ?? null) : (target.saves?.[defense] ?? null);
  if (base === null) return null;
  const mods = resolveModifiers(modifiersFor(target, CHECKS[defense]));
  return { dc: 10 + base + mods.total, mods: mods.applied };
}

/** The attacker's modifier for the skill: its listed skill, else its
 * attribute modifier (an untrained creature skill, GM Core); the elite or
 * weak step, its conditions and bonuses, and the multiple attack penalty
 * for an attack. Null without a creature record (a PC). */
export function skillModifier(
  record: Pick<Creature, "skills" | "abilityMods"> | null,
  attacker: ModifierSources & { adjustment?: { kind: "elite" | "weak" } | undefined; strikesMade: number },
  skill: string,
  attack: boolean,
): { mod: number; mods: Modifier[] } | null {
  if (!record) return null;
  const listed = record.skills?.[skill];
  const base = listed ?? record.abilityMods?.[SKILL_ATTRIBUTE[skill] ?? "str"];
  if (base === undefined) return null;
  const step = attacker.adjustment ? (attacker.adjustment.kind === "elite" ? 2 : -2) : 0;
  const all: Modifier[] = [...modifiersFor(attacker, skillChecks(skill))];
  const map = attack ? mapPenalty(attacker.strikesMade, false) : 0;
  if (map !== 0) all.push({ value: map, type: "untyped", source: "multiple attack penalty" });
  const resolved = resolveModifiers(all);
  return { mod: base + step + resolved.total, mods: resolved.applied };
}
