import { z } from "zod";
import { CreatureSourceSchema } from "./source.js";

export const ActionCostSchema = z.enum([
  "1",
  "2",
  "3",
  "reaction",
  "free",
  "passive",
]);

export const ActionSchema = z.object({
  name: z.string(),
  cost: ActionCostSchema,
  category: z.string().nullable(),
  traits: z.array(z.string()),
  trigger: z.string().nullable(),
  requirements: z.string().nullable(),
  frequency: z.object({ max: z.number(), per: z.string() }).nullable(),
  description: z.string(),
});

export const AttackSchema = z.object({
  name: z.string(),
  kind: z.enum(["melee", "ranged"]),
  bonus: z.number(),
  damage: z.array(z.object({ formula: z.string(), type: z.string() })),
  traits: z.array(z.string()),
});

export const SpellcastingSchema = z.object({
  name: z.string(),
  tradition: z.string(),
  preparation: z.string(),
  dc: z.number(),
  attack: z.number(),
  slots: z.array(z.object({ rank: z.number(), max: z.number() })),
  spells: z.array(z.object({ name: z.string(), rank: z.number() })),
});

export const CreatureSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+\/[a-z0-9-]+$/),
  foundryId: z.string(),
  name: z.string(),
  level: z.number().int(),
  rarity: z.enum(["common", "uncommon", "rare", "unique"]),
  size: z.string(),
  traits: z.array(z.string()),
  source: CreatureSourceSchema,
  ac: z.number(),
  hp: z.number(),
  saves: z.object({
    fortitude: z.number(),
    reflex: z.number(),
    will: z.number(),
  }),
  immunities: z.array(z.string()),
  weaknesses: z.array(z.object({ type: z.string(), value: z.number() })),
  resistances: z.array(z.object({ type: z.string(), value: z.number() })),
  perception: z.number(),
  senses: z.array(z.string()),
  languages: z.array(z.string()),
  skills: z.record(z.number()),
  abilityMods: z.record(z.number()),
  speeds: z.array(z.object({ type: z.string(), value: z.number() })),
  attacks: z.array(AttackSchema),
  actions: z.array(ActionSchema),
  spellcasting: z.array(SpellcastingSchema),
  gear: z.array(z.string()),
  publicNotes: z.string(),
});

export type Creature = z.infer<typeof CreatureSchema>;
export type Action = z.infer<typeof ActionSchema>;
export type Attack = z.infer<typeof AttackSchema>;
export type Spellcasting = z.infer<typeof SpellcastingSchema>;
