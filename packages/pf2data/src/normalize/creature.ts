import { z } from "zod";
import { CreatureSchema, parseSource, type Creature } from "@pf2/schema";
import { normalizeTraits } from "./traits.js";
import { normalizeDefenses } from "./defenses.js";
import { normalizeActions } from "./actions.js";
import { normalizeAttacks } from "./attacks.js";
import { normalizeSpellcasting } from "./spellcasting.js";
import { resolveLinks } from "./links.js";
import { resolveLocalize, type LangTable } from "./localize.js";
import { compareStrings } from "../util.js";

const ActorSchema = z.object({
  _id: z.string(),
  name: z.string(),
  type: z.literal("npc"),
  items: z.array(z.unknown()).default([]),
  system: z.object({
    details: z.object({
      level: z.object({ value: z.number() }),
      publication: z.unknown(),
      publicNotes: z.string().default(""),
    }),
    traits: z.unknown(),
  }),
});

// Item types consumed by the dedicated normalizers above, or otherwise not
// gear. Everything else counts as gear. This is deliberately a deny-list: an
// allow-list silently drops upstream types nobody thought of, which is exactly
// how `treasure` items (Akiros Ismort's "Silver Stag Lord Amulet", "Gold
// Pieces") went missing.
const NON_GEAR_TYPES = new Set([
  "action",
  "melee",
  "spell",
  "spellcastingEntry",
  "condition",
  "effect",
  "lore",
]);

/** A creature's Foundry item ids, aligned to `Creature.actions`/`.attacks`
 * by array position. `CreatureSchema.parse` strips `foundryId` off both
 * arrays -- deliberately, since only the French overlay needs them -- so they
 * are returned beside the creature instead, out of the SAME normalisation
 * pass. A second pass could in principle sort differently; `verifyI18n`
 * guards the alignment, but not producing the risk is better than catching
 * it. */
export interface CreatureItemIds {
  actions: { name: string; foundryId: string }[];
  attacks: { name: string; foundryId: string }[];
}

export interface NormalizedCreature {
  creature: Creature;
  items: CreatureItemIds;
}

export function normalizeCreature(
  raw: unknown,
  pack: string,
  slug: string,
  lang: LangTable,
): Creature {
  return normalizeCreatureWithItems(raw, pack, slug, lang).creature;
}

export function normalizeCreatureWithItems(
  raw: unknown,
  pack: string,
  slug: string,
  lang: LangTable,
): NormalizedCreature {
  const actor = ActorSchema.parse(raw);
  const traits = normalizeTraits(actor.system.traits, `${pack}/${slug} (${actor.name})`);
  // Deliberately the RAW system, not `actor.system`: ActorSchema's `system`
  // sub-schema does not passthrough, so zod has already stripped `attributes`,
  // `perception`, `saves` and `skills` from the parsed copy. `ActorSchema.parse`
  // above has already guaranteed `raw.system` exists. Do not "simplify" this.
  const defenses = normalizeDefenses((raw as { system: unknown }).system);

  const gear = actor.items
    .map((i) => i as { type?: string; name?: string })
    .filter((i) => i.type !== undefined && !NON_GEAR_TYPES.has(i.type))
    .map((i) => i.name ?? "")
    .filter((n) => n !== "")
    .sort(compareStrings);

  // Localize first, links second: localized glossary text (Grab, Attack of
  // Opportunity, ...) itself contains @UUID references that must survive
  // resolveLocalize (applied inside normalizeActions) to be resolved here.
  const actions = normalizeActions(actor.items, lang).map((a) => ({
    ...a,
    description: resolveLinks(a.description),
    trigger: a.trigger === null ? null : resolveLinks(a.trigger),
    requirements: a.requirements === null ? null : resolveLinks(a.requirements),
  }));

  const attacks = normalizeAttacks(actor.items);

  const creature = CreatureSchema.parse({
    id: `${pack}/${slug}`,
    foundryId: actor._id,
    name: actor.name,
    level: actor.system.details.level.value,
    rarity: traits.rarity,
    size: traits.size,
    traits: traits.traits,
    source: parseSource(actor.system.details.publication, pack),
    ...defenses,
    attacks,
    actions,
    spellcasting: normalizeSpellcasting(actor.items),
    gear,
    publicNotes: resolveLinks(resolveLocalize(actor.system.details.publicNotes, lang)),
  } satisfies Creature);

  return {
    creature,
    items: {
      actions: actions.map((a) => ({ name: a.name, foundryId: a.foundryId })),
      attacks: attacks.map((a) => ({ name: a.name, foundryId: a.foundryId })),
    },
  };
}
