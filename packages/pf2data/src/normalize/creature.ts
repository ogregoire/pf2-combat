import { z } from "zod";
import { CreatureSchema, parseSource, type Creature } from "@pf2/schema";
import { normalizeTraits } from "./traits.js";
import { normalizeDefenses } from "./defenses.js";
import { normalizeActions } from "./actions.js";
import { normalizeAttacks } from "./attacks.js";
import { normalizeSpellcasting } from "./spellcasting.js";
import { resolveLinks } from "./links.js";

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

export function normalizeCreature(
  raw: unknown,
  pack: string,
  slug: string,
): Creature {
  const actor = ActorSchema.parse(raw);
  const traits = normalizeTraits(actor.system.traits);
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
    .sort((a, b) => a.localeCompare(b));

  const actions = normalizeActions(actor.items).map((a) => ({
    ...a,
    description: resolveLinks(a.description),
    trigger: a.trigger === null ? null : resolveLinks(a.trigger),
    requirements: a.requirements === null ? null : resolveLinks(a.requirements),
  }));

  return CreatureSchema.parse({
    id: `${pack}/${slug}`,
    foundryId: actor._id,
    name: actor.name,
    level: actor.system.details.level.value,
    rarity: traits.rarity,
    size: traits.size,
    traits: traits.traits,
    source: parseSource(actor.system.details.publication, pack),
    ...defenses,
    attacks: normalizeAttacks(actor.items),
    actions,
    spellcasting: normalizeSpellcasting(actor.items),
    gear,
    publicNotes: resolveLinks(actor.system.details.publicNotes),
  } satisfies Creature);
}
