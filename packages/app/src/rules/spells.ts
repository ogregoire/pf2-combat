import type { Spellcasting } from "@pf2/schema";

type Spell = Spellcasting["spells"][number];

/** What casting a spell costs, read from its raw cast time. A range ("1 to
 * 3", "1 or 2") lets the GM pick how many actions to spend — Heal at 1, 2
 * or 3 actions is three different spells in effect. Anything measured in
 * minutes or longer can't be cast in an encounter turn at all. */
export type SpellCost =
  | { kind: "actions"; min: number; max: number }
  | { kind: "reaction" }
  | { kind: "free" }
  | { kind: "long"; text: string };

export function spellCost(cost: string): SpellCost {
  if (cost === "reaction") return { kind: "reaction" };
  if (cost === "free") return { kind: "free" };
  const single = /^([123])$/.exec(cost);
  if (single) return { kind: "actions", min: Number(single[1]), max: Number(single[1]) };
  const range = /^([123]) (?:to|or) ([123])$/.exec(cost);
  if (range) return { kind: "actions", min: Number(range[1]), max: Number(range[2]) };
  return { kind: "long", text: cost };
}

/** Sort weight for "descending actions taken": the most actions first,
 * a range counting as its maximum, then reactions and free actions, and
 * casts too long for a turn last of all. */
export function costWeight(cost: SpellCost): number {
  switch (cost.kind) {
    case "actions":
      return cost.max;
    case "reaction":
      return 0.5;
    case "free":
      return 0.25;
    case "long":
      return -1;
  }
}

/** How many times a spell can be cast, and what spending one draws from.
 * The PF2 limits, by how the creature casts:
 *  - cantrips: unlimited;
 *  - innate: at will is unlimited, constant is always on and never cast,
 *    otherwise the stated per-day count — once a day when none is stated;
 *  - spontaneous: the slots of that rank, shared by every spell of it;
 *  - prepared: each prepared copy once;
 *  - focus: one Focus Point each, from a pool shared by all the creature's
 *    focus spells.
 * There is no limit on casting several spells in one turn beyond the
 * actions they cost. `key` names the pool in `Combatant.spellUses`; null
 * when nothing is spent. `max` is null for unlimited. */
export type CastLimit =
  | { kind: "constant" }
  | { kind: "unlimited" }
  | { kind: "limited"; key: string; max: number; per: "day" | "slot" | "prepared" | "focus" };

export const FOCUS_KEY = "focus";

export function castLimit(
  entry: Spellcasting,
  entryIndex: number,
  spell: Spell,
  spellIndex: number,
  focusPool: number,
): CastLimit {
  if (spell.frequency === "constant") return { kind: "constant" };
  if (spell.cantrip || spell.frequency === "at-will") return { kind: "unlimited" };
  switch (entry.preparation) {
    case "innate":
      return { kind: "limited", key: `${entryIndex}:${spellIndex}`, max: spell.uses ?? 1, per: "day" };
    case "spontaneous": {
      const slots = entry.slots.find((s) => s.rank === spell.rank)?.max ?? 0;
      return { kind: "limited", key: `${entryIndex}:rank${spell.rank}`, max: slots, per: "slot" };
    }
    case "prepared":
      return { kind: "limited", key: `${entryIndex}:${spellIndex}`, max: spell.prepared, per: "prepared" };
    case "focus":
      return { kind: "limited", key: FOCUS_KEY, max: focusPool, per: "focus" };
    default:
      return { kind: "unlimited" };
  }
}

/** The creature's Focus Point pool: what its focus entries state, else one
 * per focus spell up to 3 — the GM Core default for a creature with focus
 * spells and no stated pool (2 creatures in the dataset). */
export function focusPool(spellcasting: Spellcasting[]): number {
  const focus = spellcasting.filter((e) => e.preparation === "focus");
  if (focus.length === 0) return 0;
  const stated = focus.map((e) => e.focusPoints).filter((n): n is number => n !== null);
  if (stated.length > 0) return Math.max(...stated);
  return Math.min(3, focus.reduce((n, e) => n + e.spells.filter((s) => !s.cantrip).length, 0));
}

export interface SpellRow {
  entry: Spellcasting;
  entryIndex: number;
  spell: Spell;
  spellIndex: number;
  /** Position in the flattened spell list — what the French overlay's
   * `spells` array aligns to. */
  flatIndex: number;
  cost: SpellCost;
  limit: CastLimit;
}

/** Every spell the creature has, across its spellcasting entries, in one
 * list: highest rank first, then the most actions; cantrips after the
 * ranked spells, the way stat blocks list them; then by name. */
export function spellRows(spellcasting: Spellcasting[]): SpellRow[] {
  const pool = focusPool(spellcasting);
  const rows: SpellRow[] = [];
  let flatIndex = 0;
  spellcasting.forEach((entry, entryIndex) => {
    entry.spells.forEach((spell, spellIndex) => {
      const cost = spellCost(spell.cost);
      rows.push({ entry, entryIndex, spell, spellIndex, flatIndex, cost, limit: castLimit(entry, entryIndex, spell, spellIndex, pool) });
      flatIndex += 1;
    });
  });
  return rows.sort(
    (a, b) =>
      Number(a.spell.cantrip) - Number(b.spell.cantrip) ||
      b.spell.rank - a.spell.rank ||
      costWeight(b.cost) - costWeight(a.cost) ||
      (a.spell.name < b.spell.name ? -1 : a.spell.name > b.spell.name ? 1 : 0),
  );
}

/** Casts left in a limit's pool, or null when unlimited (or constant). */
export function castsLeft(limit: CastLimit, spellUses: Record<string, number>): number | null {
  if (limit.kind !== "limited") return null;
  return Math.max(0, limit.max - (spellUses[limit.key] ?? 0));
}
