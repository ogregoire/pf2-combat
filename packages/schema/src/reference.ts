import { z } from "zod";
import { ActionCostSchema } from "./creature.js";

export const ConditionSchema = z.object({
  slug: z.string(),
  name: z.string(),
  isValued: z.boolean(),
  description: z.string(),
});

export const GlossaryEntrySchema = z.object({
  slug: z.string(),
  name: z.string(),
  cost: ActionCostSchema,
  traits: z.array(z.string()),
  description: z.string(),
});

/** A weapon/action trait or keyword (agile, deadly, reach, ...) — distinct
 * from `GlossaryEntry`, which is the monster-*ability* glossary (Grab,
 * Attack of Opportunity, ...) and has no entries for these. */
export const TraitSchema = z.object({
  slug: z.string(),
  name: z.string(),
  description: z.string(),
});

export type Condition = z.infer<typeof ConditionSchema>;
export type GlossaryEntry = z.infer<typeof GlossaryEntrySchema>;
export type Trait = z.infer<typeof TraitSchema>;
