import { compareStrings } from "./compare.js";

/**
 * PF2 damage types — the subset of IWR entries a damage roll can actually
 * be. The test: does picking this change the number? Materials (cold-iron,
 * silver, ...) are exceptions on a physical resistance, not their own
 * damage type, and conditions (paralyzed, disease, ...) can't be affected
 * by any damage type at all — neither belongs here.
 */
export const DAMAGE_TYPES = new Set([
  "bludgeoning", "piercing", "slashing",
  "acid", "cold", "electricity", "fire", "force", "sonic", "vitality", "void",
  "mental", "poison", "bleed", "precision", "spirit",
  "physical", "holy", "unholy", "all-damage", "area-damage", "splash-damage",
]);

export interface Iwr {
  // Immunity exceptions ("immune to X except Y") exist in the dataset but
  // aren't modelled here — immunity is stored as a bare type string, and
  // widening that would ripple through every fixture that constructs one.
  // Every exceptions example actually found in data/creatures is on a
  // resistance (see applyIwr), which this does model.
  immunities: string[];
  weaknesses: { type: string; value: number; exceptions?: string[] }[];
  resistances: { type: string; value: number; exceptions?: string[] }[];
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

/**
 * Applies immunity, weakness and resistance for the GM's chosen damage type
 * to a raw damage amount. `type: "none"` — the RowPopover default, and
 * every hit where the GM hasn't picked one — means IWR is deliberately not
 * being applied (per the spec: type is only shown, and only matters, when
 * it changes the result), so the amount passes through unchanged.
 *
 * `exceptions` carves an entry back out for a specific type it doesn't
 * apply to (e.g. resistance to physical 5 except bludgeoning) — since the
 * type checked here is always the entry's own `type` (the button the GM
 * pressed is literally that entry), an entry's exceptions list matters only
 * when it names an *exception* damage type the GM might independently pick
 * that happens to also match a *different* entry's own type; it's included
 * for completeness and because the dataset carries it, not because a
 * collision is common.
 */
export function applyIwr(amount: number, type: string, iwr: Iwr | null): number {
  if (iwr === null || type === "none" || amount <= 0) return amount;

  if (iwr.immunities.includes(type)) return 0;

  let total = amount;
  for (const w of iwr.weaknesses) {
    if (w.type === type && !(w.exceptions ?? []).includes(type)) total += w.value;
  }
  for (const r of iwr.resistances) {
    if (r.type === type && !(r.exceptions ?? []).includes(type)) total = Math.max(0, total - r.value);
  }
  return total;
}
