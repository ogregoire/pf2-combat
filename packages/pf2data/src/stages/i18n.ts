import type { CreatureI18n } from "@pf2/schema";
import type { BabeleTable } from "./babele.js";

/**
 * Builds a creature's French overlay by aligning Babele's per-item
 * translations (keyed by Foundry item id) to the SAME sorted
 * actions/attacks arrays the English creature already uses — by array
 * position, never by name. 156 real creatures carry two Strikes of the same
 * English name (a melee and a thrown Dagger, Hatchet or Spear); a name key
 * would silently collapse them onto one translation.
 *
 * The creature entry itself is resolved via `BabeleTable.lookup`, NEVER a
 * flat name lookup: `Shambler` is "Tertre errant" in the Kingmaker bestiary
 * but "Grand tertre" in Bestiary 1, and `Guard` names both a creature and an
 * action. `lookup`'s own-pack-first, kind-scoped resolution is exactly what
 * keeps those apart; bypassing it here would reintroduce both collisions.
 *
 * Absent creature, or absent item translation, both yield `null` rather
 * than the English text: a missing translation must stay visible to
 * `report`, not be hidden by a silent fallback.
 */
export function buildCreatureI18n(args: {
  creatureName: string;
  /** The pack this creature ships in — `lookup` prefers its translation. */
  ownPack: string;
  actions: { name: string; foundryId: string }[];
  attacks: { name: string; foundryId: string }[];
  table: BabeleTable;
}): CreatureI18n | null {
  const entry = args.table.lookup("creature", args.ownPack, args.creatureName);
  if (!entry) return null;

  const items = entry.items ?? {};

  return {
    name: entry.name,
    publicNotes: entry.description ?? null,
    actions: args.actions.map((action) => ({
      en: action.name,
      name: items[action.foundryId]?.name ?? null,
      description: items[action.foundryId]?.description ?? null,
    })),
    attacks: args.attacks.map((attack) => ({
      en: attack.name,
      name: items[attack.foundryId]?.name ?? null,
    })),
  };
}
