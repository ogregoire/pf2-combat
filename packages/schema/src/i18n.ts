import { z } from "zod";

/**
 * A creature's French overlay: translated fields aligned to the SAME sorted
 * arrays `Creature.actions`/`.attacks` already use, by position — never by
 * name, since some creatures carry two Strikes of the same English name
 * (e.g. a melee and a thrown Dagger). `null` means no French translation
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
    }),
  ),
  attacks: z.array(
    z.object({
      en: z.string(),
      name: z.string().nullable(),
    }),
  ),
});

export type CreatureI18n = z.infer<typeof CreatureI18nSchema>;
