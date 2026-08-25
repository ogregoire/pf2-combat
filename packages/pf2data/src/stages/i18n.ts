import type { CreatureI18n } from "@pf2/schema";
import type { BabeleEntry } from "./babele.js";

/**
 * Builds a creature's French overlay by aligning Babele's per-item
 * translations (keyed by Foundry item id) to the SAME sorted
 * actions/attacks arrays the English creature already uses — by array
 * position, never by name. 156 real creatures carry two Strikes of the same
 * English name (a melee and a thrown Dagger, Hatchet or Spear); a name key
 * would silently collapse them onto one translation.
 *
 * `table` maps a creature's English name to its Babele entry — already
 * resolved to the right pack/kind by the caller (`BabeleTable.lookup`).
 * Absent creature, or absent item translation, both yield `null` rather
 * than the English text: a missing translation must stay visible to
 * `report`, not be hidden by a silent fallback.
 */
export function buildCreatureI18n(args: {
  creatureName: string;
  actions: { name: string; foundryId: string }[];
  attacks: { name: string; foundryId: string }[];
  table: Map<string, BabeleEntry>;
}): CreatureI18n | null {
  const entry = args.table.get(args.creatureName);
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
