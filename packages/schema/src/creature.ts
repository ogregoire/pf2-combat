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

/**
 * A spell's key into `spells/<slug>.json`, so it doubles as a file name: the
 * pattern keeps it to lowercase ASCII words joined by single hyphens. Every
 * slug the five books reference already has that shape -- the compendium's
 * one accented file stem (`déjà-vu`) is not referenced by any creature.
 */
export const SpellSlugSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

export const SpellcastingSchema = z.object({
  name: z.string(),
  tradition: z.string(),
  preparation: z.string(),
  dc: z.number(),
  attack: z.number(),
  slots: z.array(z.object({ rank: z.number(), max: z.number() })),
  /** Focus entries only: the creature's focus pool max (actor
   * `system.resources.focus.max`), `null` when upstream doesn't state it (2
   * of 56 focus entries today), and `null` on every non-focus entry. */
  focusPoints: z.number().nullable(),
  spells: z.array(
    z.object({
      /** Upstream item name, unchanged -- keeps "(At Will)", "(Constant)",
       * "(Self Only)" and the like. */
      name: z.string(),
      /** The key into `spells/<slug>.json`: the spell item's own
       * `system.slug`, else its compendium source's slug, else its
       * slugified base name. Shared by every creature carrying the same
       * spell, whatever qualifier its `name` adds. */
      slug: SpellSlugSchema,
      /** Effective rank: a cantrip's is its entry's heightening rank, a
       * prepared spell's is the slot rank it is prepared in, anything else
       * is its `heightenedLevel` or else its base level. */
      rank: z.number(),
      /** Raw upstream cast time: "1", "2", "3", "1 to 3", "reaction",
       * "free", "10 minutes", ... -- long cast times are kept, not dropped. */
      cost: z.string(),
      cantrip: z.boolean(),
      /** Parsed from the name's parenthetical; `null` for an ordinary
       * spell. */
      frequency: z.enum(["at-will", "constant"]).nullable(),
      /** Innate per-day count (`location.uses.max`), else `null`. */
      uses: z.number().nullable(),
      /** Prepared entries: how many slots hold this spell at this rank (a
       * spell prepared at two ranks is two rows). 0 for every other
       * preparation. */
      prepared: z.number(),
    }),
  ),
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
