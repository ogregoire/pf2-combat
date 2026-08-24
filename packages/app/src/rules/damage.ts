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

function combinedLabel(weakness: number | undefined, resistance: number | undefined): string {
  // The common case (only one of the two present) keeps the plain numeric
  // label callers already depend on; only a genuine same-type weakness +
  // resistance combo (real PF2 mechanic — e.g. a mummy's cold weakness next
  // to an unrelated cold resistance) needs the signed, combined form.
  if (weakness !== undefined && resistance !== undefined) return `+${weakness} / −${resistance}`;
  if (weakness !== undefined) return String(weakness);
  return String(resistance);
}

/**
 * Filters a creature's IWR down to damage-type entries only — many creatures
 * carry condition immunities (disease, paralyzed, unconscious) that a
 * damage type cannot affect, so those are never relevant here.
 *
 * Deduped by type: the dataset can carry a weakness and a resistance to the
 * same type on one creature (Bog Mummy Cultist: weakness cold 10, resistance
 * cold 5 — both real), which used to emit two rows both keyed "cold",
 * colliding as a React list key and leaving the GM only one, ambiguous,
 * button. They're merged into a single row here instead. A type also immune
 * shows only "IMM" — immunity makes weakness/resistance moot (applyIwr
 * checks it first and returns 0 regardless).
 */
export function relevantDamageTypes(iwr: Iwr | null): RelevantType[] {
  if (iwr === null) return [];

  const immuneTypes = new Set(iwr.immunities.filter((t) => DAMAGE_TYPES.has(t)));

  const byType = new Map<string, { weakness?: number; resistance?: number }>();
  for (const w of iwr.weaknesses) {
    if (!DAMAGE_TYPES.has(w.type) || immuneTypes.has(w.type)) continue;
    const entry = byType.get(w.type) ?? {};
    if (entry.weakness === undefined) entry.weakness = w.value; // first entry wins on a same-type dupe
    byType.set(w.type, entry);
  }
  for (const r of iwr.resistances) {
    if (!DAMAGE_TYPES.has(r.type) || immuneTypes.has(r.type)) continue;
    const entry = byType.get(r.type) ?? {};
    if (entry.resistance === undefined) entry.resistance = r.value;
    byType.set(r.type, entry);
  }

  const relevant: RelevantType[] = [...immuneTypes].map((type) => ({ type, label: "IMM" }));
  for (const [type, { weakness, resistance }] of byType) {
    relevant.push({ type, label: combinedLabel(weakness, resistance) });
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
  // .find(), not a non-breaking loop: a same-type duplicate within one
  // category (weaknesses or resistances) must only apply once, matching
  // relevantDamageTypes' own "first entry wins on a dupe" rule. A weakness
  // and a resistance to the *same* type are a different, legitimate case
  // (see relevantDamageTypes) and both still apply, independently, below.
  const weakness = iwr.weaknesses.find((w) => w.type === type && !(w.exceptions ?? []).includes(type));
  if (weakness) total += weakness.value;
  const resistance = iwr.resistances.find((r) => r.type === type && !(r.exceptions ?? []).includes(type));
  if (resistance) total = Math.max(0, total - resistance.value);
  return total;
}
