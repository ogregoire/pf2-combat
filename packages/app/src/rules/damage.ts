import { compareStrings } from "./compare.js";

/** PF2 damage types — the subset of IWR entries a damage roll can actually be. */
export const DAMAGE_TYPES = new Set([
  "bludgeoning", "piercing", "slashing",
  "acid", "cold", "electricity", "fire", "force", "sonic", "vitality", "void",
  "mental", "poison", "bleed", "precision", "spirit",
]);

export interface Iwr {
  immunities: string[];
  weaknesses: { type: string; value: number }[];
  resistances: { type: string; value: number }[];
}

export interface RelevantType { type: string; label: string }

/**
 * Filters a creature's IWR down to damage-type entries only — many creatures
 * carry condition immunities (disease, paralyzed, unconscious) that a
 * damage type cannot affect, so those are never relevant here.
 */
export function relevantDamageTypes(iwr: Iwr | null): RelevantType[] {
  if (iwr === null) return [];
  const relevant: RelevantType[] = [];
  for (const type of iwr.immunities) {
    if (DAMAGE_TYPES.has(type)) relevant.push({ type, label: "IMM" });
  }
  for (const w of iwr.weaknesses) {
    if (DAMAGE_TYPES.has(w.type)) relevant.push({ type: w.type, label: String(w.value) });
  }
  for (const r of iwr.resistances) {
    if (DAMAGE_TYPES.has(r.type)) relevant.push({ type: r.type, label: String(r.value) });
  }
  return relevant.sort((a, b) => compareStrings(a.type, b.type));
}
