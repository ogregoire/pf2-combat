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

export type Condition = z.infer<typeof ConditionSchema>;
export type GlossaryEntry = z.infer<typeof GlossaryEntrySchema>;
