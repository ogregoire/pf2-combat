import { z } from "zod";
import { ActionCostSchema, SpellSlugSchema } from "./creature.js";

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

/**
 * `spells/<slug>.json`: one spell's rules text, for every distinct slug a
 * creature's spell row references. The canonical compendium spell where
 * there is one, else a creature's own embedded copy -- see
 * `buildSpellDetails`. Every field is the spell's BASE form: `rank` is its
 * base rank (a creature row's `rank` is the effective one it is cast at),
 * and `description` carries upstream's Heightened entries only when
 * upstream wrote them into the text.
 */
export const SpellDetailSchema = z.object({
  slug: SpellSlugSchema,
  /** English, without the creature-side qualifiers ("(At Will)", ...). */
  name: z.string(),
  /** Base rank; 1 for a cantrip, as upstream stores it. */
  rank: z.number().int(),
  cantrip: z.boolean(),
  traits: z.array(z.string()),
  /** `system.traits.traditions`; empty for a focus spell and the like. */
  traditions: z.array(z.string()),
  /** Raw upstream cast time, the same vocabulary as a creature spell row's
   * `cost`. */
  cost: z.string(),
  /** Raw text ("30 feet", "touch", "planetary"); `null` when upstream
   * leaves it empty. */
  range: z.string().nullable(),
  area: z.object({ type: z.string(), value: z.number() }).nullable(),
  targets: z.string().nullable(),
  /** The saving throw; `null` when there is none, including when
   * upstream's only defense is a passive one such as AC. */
  defense: z
    .object({
      save: z.enum(["fortitude", "reflex", "will"]),
      basic: z.boolean(),
    })
    .nullable(),
  duration: z.string().nullable(),
  sustained: z.boolean(),
  description: z.string(),
});

export type Condition = z.infer<typeof ConditionSchema>;
export type GlossaryEntry = z.infer<typeof GlossaryEntrySchema>;
export type Trait = z.infer<typeof TraitSchema>;
export type StandardAction = z.infer<typeof StandardActionSchema>;
export type SpellDetail = z.infer<typeof SpellDetailSchema>;
