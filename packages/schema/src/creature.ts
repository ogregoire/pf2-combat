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
  damage: z.array(
    z.object({
      formula: z.string(),
      type: z.string(),
      category: z.string().nullable(),
    }),
  ),
  traits: z.array(z.string()),
  effects: z.array(z.string()),
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

export const SaveSchema = z.object({
  value: z.number(),
  detail: z.string().nullable(),
});

export const SenseSchema = z.object({
  type: z.string(),
  acuity: z.string().nullable(),
  range: z.number().nullable(),
});

const IwrExtrasSchema = {
  exceptions: z.array(z.string()),
  doubleVs: z.array(z.string()),
};

export const ImmunitySchema = z.object({
  type: z.string(),
  ...IwrExtrasSchema,
});

export const WeaknessSchema = z.object({
  type: z.string(),
  value: z.number(),
  ...IwrExtrasSchema,
});

export const ResistanceSchema = z.object({
  type: z.string(),
  value: z.number(),
  ...IwrExtrasSchema,
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
  acDetails: z.string().nullable(),
  hp: z.number(),
  hpDetails: z.string().nullable(),
  saves: z.object({
    fortitude: SaveSchema,
    reflex: SaveSchema,
    will: SaveSchema,
  }),
  immunities: z.array(ImmunitySchema),
  weaknesses: z.array(WeaknessSchema),
  resistances: z.array(ResistanceSchema),
  perception: z.number(),
  senses: z.array(SenseSchema),
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
export type Save = z.infer<typeof SaveSchema>;
export type Sense = z.infer<typeof SenseSchema>;
export type Immunity = z.infer<typeof ImmunitySchema>;
export type Weakness = z.infer<typeof WeaknessSchema>;
export type Resistance = z.infer<typeof ResistanceSchema>;
