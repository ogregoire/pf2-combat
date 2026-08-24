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

const GEAR_TYPES = new Set(["equipment", "weapon", "armor", "consumable"]);

export function normalizeCreature(
  raw: unknown,
  pack: string,
  slug: string,
): Creature {
  const actor = ActorSchema.parse(raw);
  const traits = normalizeTraits(actor.system.traits);
  const defenses = normalizeDefenses((raw as { system: unknown }).system);

  const gear = actor.items
    .map((i) => i as { type?: string; name?: string })
    .filter((i) => i.type !== undefined && GEAR_TYPES.has(i.type))
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
