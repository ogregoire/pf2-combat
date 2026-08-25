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

/**
 * Search-index overlay: id -> French name, for creatures the Babele table
 * covers. Resolved via `table.lookup("creature", ownPack, name)`, NEVER a
 * flat name lookup, and `ownPack` is derived from the entry's OWN id rather
 * than passed in: `Shambler` is "Tertre errant" in the Kingmaker bestiary
 * pack and "Grand tertre" in Bestiary 1, so the same English name must
 * resolve differently depending on which pack's entry is being indexed. An
 * id's pack is everything before the first `/` (`kingmaker-bestiary/the-
 * stag-lord` -> `kingmaker-bestiary`).
 *
 * A creature the table has no entry for is OMITTED, never given its English
 * name as a stand-in -- a missing translation must stay visible to
 * `report`, not be hidden by a silent fallback.
 */
export function buildIndexI18n(
  entries: { id: string; name: string }[],
  table: BabeleTable,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const entry of entries) {
    const ownPack = entry.id.slice(0, entry.id.indexOf("/"));
    const found = table.lookup("creature", ownPack, entry.name);
    if (found) out[entry.id] = found.name;
  }
  return out;
}

/**
 * Conditions and monster-ability-glossary entries have no per-entry "home
 * pack" the way a creature has its own bestiary -- they're each just one
 * (conditions) or two (glossary) Babele files with no natural preference
 * between them. Passing a pack name that can't exist in the table skips the
 * own-pack shortcut and goes straight to `lookup`'s kind-scoped search
 * across every file of that kind, which throws if the sources disagree --
 * the same protection a real own pack gives the creature builder.
 */
const NO_OWN_PACK = "";

/**
 * English condition name -> French name, resolved under the "condition"
 * kind so a name that also happens to be a creature or glossary entry
 * (`Guard` names both a creature and an action) can never bleed in.
 * Untranslated names are OMITTED, never echoed in English.
 */
export function buildConditionsI18n(
  names: string[],
  table: BabeleTable,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name of names) {
    const found = table.lookup("condition", NO_OWN_PACK, name);
    if (found) out[name] = found.name;
  }
  return out;
}

/**
 * English glossary-entry name -> French name, resolved under the
 * "glossary" kind (the monster-ability glossary), never pooled with
 * conditions or creatures. Untranslated names are OMITTED, never echoed in
 * English.
 */
export function buildGlossaryI18n(
  names: string[],
  table: BabeleTable,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name of names) {
    const found = table.lookup("glossary", NO_OWN_PACK, name);
    if (found) out[name] = found.name;
  }
  return out;
}
