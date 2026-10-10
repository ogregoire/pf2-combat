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

/**
 * One of PF2's standard actions (Stride, Step, Shove, Demoralize, ...), from
 * upstream's `actions` pack folders "Basic Actions" and "Skill Actions". No
 * `"passive"` cost, unlike `ActionCostSchema`: a passive entry in those
 * folders (Earn Income, Treat Wounds, Coerce, ...) is an exploration or
 * downtime activity, not something usable in an encounter, so it is never
 * emitted.
 */
export const StandardActionSchema = z.object({
  slug: z.string(),
  name: z.string(),
  cost: z.enum(["1", "2", "3", "reaction", "free"]),
  category: z.enum(["basic", "skill"]),
  traits: z.array(z.string()),
  description: z.string(),
});

export type Condition = z.infer<typeof ConditionSchema>;
export type GlossaryEntry = z.infer<typeof GlossaryEntrySchema>;
export type Trait = z.infer<typeof TraitSchema>;
export type StandardAction = z.infer<typeof StandardActionSchema>;
