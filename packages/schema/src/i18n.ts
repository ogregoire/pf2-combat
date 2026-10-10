import { z } from "zod";
import { VocabularySchema } from "./reference.js";

/**
 * A creature's French overlay: translated fields aligned to the SAME sorted
 * arrays `Creature.actions`/`.attacks` (and its flattened spells) already
 * use, by position — never by name, since some creatures carry two Strikes
 * of the same English name (e.g. a melee and a thrown Dagger). `null` means no French translation
 * exists for that field; the app decides the fallback, so a gap is never
 * hidden by copying the English text in.
 */
export const CreatureI18nSchema = z.object({
  name: z.string(),
  publicNotes: z.string().nullable(),
  actions: z.array(
    z.object({
      en: z.string(),
      name: z.string().nullable(),
      description: z.string().nullable(),
      /** Extracted from the French `<strong>Déclencheur</strong>` paragraph
       * (`extractTriggerFr`), same shape as the English Trigger. */
      trigger: z.string().nullable(),
      /** Extracted from the French `<strong>Conditions</strong>` paragraph
       * (`extractRequirementsFr`) -- "Conditions" here is French for
       * REQUIREMENTS (a prerequisite to use the action), NOT the
       * status-effect sense of "conditions". */
      requirements: z.string().nullable(),
    }),
  ),
  attacks: z.array(
    z.object({
      en: z.string(),
      name: z.string().nullable(),
    }),
  ),
  /** Aligned by position to the creature's spells FLATTENED across its
   * `spellcasting` entries (entries in order, each entry's spells in order).
   * A spell prepared at two ranks appears twice there, so twice here. */
  spells: z.array(
    z.object({
      en: z.string(),
      name: z.string().nullable(),
    }),
  ),
});

export type CreatureI18n = z.infer<typeof CreatureI18nSchema>;

/**
 * `i18n/fr/actions.json`: OUR standard-action slug -> French name and
 * description. Keyed by slug, never by name, like the conditions and glossary
 * overlays. An action with no French entry at all is OMITTED; `description`
 * is `null` when the entry is translated by name only -- never the English
 * text standing in for a missing translation.
 */
export const StandardActionsI18nSchema = z.record(
  z.string(),
  z.object({
    name: z.string(),
    description: z.string().nullable(),
  }),
);

export type StandardActionsI18n = z.infer<typeof StandardActionsI18nSchema>;

/**
 * `i18n/fr/spells/<slug>.json`: one spell's French text, for a slug that has
 * a `spells/<slug>.json`. The file is OMITTED when there is no French name at
 * all. Every other field is `null` when its source has no translation for it
 * -- never the English text standing in -- and `range`/`targets`/`duration`
 * are also `null` whenever the English field itself is.
 */
export const SpellI18nSchema = z.object({
  name: z.string(),
  description: z.string().nullable(),
  range: z.string().nullable(),
  targets: z.string().nullable(),
  duration: z.string().nullable(),
});

export type SpellI18n = z.infer<typeof SpellI18nSchema>;

/**
 * `i18n/fr/vocabulary.json`: the `vocabulary.json` shape with French names,
 * keyed by the SAME slugs. A slug with no French name is OMITTED, never
 * given the English one -- and so is an attribute missing either its full
 * name or its short form, since the stat block shows both.
 */
export const VocabularyI18nSchema = VocabularySchema.extend({
  attributes: VocabularySchema.shape.attributes.partial(),
});

export type VocabularyI18n = z.infer<typeof VocabularyI18nSchema>;
