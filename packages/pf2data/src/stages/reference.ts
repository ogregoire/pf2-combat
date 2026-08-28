import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import type { Condition, GlossaryEntry, Trait } from "@pf2/schema";
import { walkPack } from "../io/walk.js";
import { resolveLinks } from "../normalize/links.js";
import { resolveLocalize, type LangTable } from "../normalize/localize.js";
import { compareStrings } from "../util.js";

const ConditionItemSchema = z.object({
  name: z.string(),
  type: z.literal("condition"),
  system: z.object({
    description: z.object({ value: z.string().default("") }),
    value: z.object({ isValued: z.boolean() }),
  }),
});

const GlossaryItemSchema = z.object({
  name: z.string(),
  type: z.literal("action"),
  system: z.object({
    actionType: z.object({
      value: z.enum(["action", "reaction", "free", "passive"]),
    }),
    actions: z.object({ value: z.number().nullable() }).optional(),
    description: z.object({ value: z.string().default("") }),
    traits: z.object({ value: z.array(z.string()).default([]) }).optional(),
  }),
});

export function buildConditions(
  packsDir: string,
  lang: LangTable,
  packs: string[],
): Condition[] {
  const conditions: Condition[] = [];

  for (const pack of packs) {
    for (const file of walkPack(join(packsDir, pack))) {
      const raw: unknown = JSON.parse(readFileSync(file.absolutePath, "utf8"));
      const parsed = ConditionItemSchema.safeParse(raw);
      if (!parsed.success) continue;
      conditions.push({
        slug: file.slug,
        name: parsed.data.name,
        isValued: parsed.data.system.value.isValued,
        description: resolveLinks(
          resolveLocalize(parsed.data.system.description.value, lang),
        ),
      });
    }
  }

  return conditions.sort((a, b) => compareStrings(a.slug, b.slug));
}

export function buildGlossary(
  packsDir: string,
  lang: LangTable,
  packs: string[],
): GlossaryEntry[] {
  const entries: GlossaryEntry[] = [];

  for (const pack of packs) {
    for (const file of walkPack(join(packsDir, pack))) {
      const raw: unknown = JSON.parse(readFileSync(file.absolutePath, "utf8"));
      const parsed = GlossaryItemSchema.safeParse(raw);
      if (!parsed.success) continue;
      const { name, system } = parsed.data;

      const kind = system.actionType.value;
      const n = system.actions?.value;
      const cost =
        kind !== "action"
          ? kind
          : n === 1 || n === 2 || n === 3
            ? (String(n) as GlossaryEntry["cost"])
            : "passive";

      entries.push({
        slug: file.slug,
        name,
        cost,
        traits: [...(system.traits?.value ?? [])].sort(compareStrings),
        description: resolveLinks(
          resolveLocalize(system.description.value, lang),
        ),
      });
    }
  }

  return entries.sort((a, b) => compareStrings(a.slug, b.slug));
}

const TRAIT_DESCRIPTION_PREFIX = "PF2E.TraitDescription";
const TRAIT_NAME_PREFIX = "PF2E.Trait";

/** `TraitDescriptionAwakenedAnimal` -> `awakened-animal`, `TraitDescriptionSplash10`
 * -> `splash-10`: a hyphen before every internal uppercase letter and before
 * every letter-to-digit boundary, then lowercased. Checked against the real
 * 426-key list before relying on it — no acronyms, only one digit-bearing
 * suffix (Splash10), no collisions. */
function slugFromTraitDescriptionKey(suffix: string): string {
  return suffix
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/([A-Za-z])(\d)/g, "$1-$2")
    .toLowerCase();
}

function titleCaseFromSlug(slug: string): string {
  return slug
    .split("-")
    .map((w) => w[0]!.toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * Weapon/action traits and keywords (agile, deadly, reach, ...), sourced
 * from `static/lang/en.json`'s `PF2E.TraitDescription*` keys — 426 of them,
 * already loaded into `lang` for `@Localize` resolution elsewhere, just
 * never read for their own sake before. Distinct from `buildGlossary`,
 * which is the monster-*ability* glossary and has nothing for these.
 *
 * The matching `PF2E.Trait<Suffix>` key supplies the display name; a
 * handful of suffixes (12 of 426) have no such key, so those fall back to a
 * title-cased slug rather than being dropped.
 */
export interface ScannedTrait {
  slug: string;
  /** `null` when the lang table carries no `PF2E.Trait<Suffix>` display-name
   * key for this trait. The English build substitutes a title-cased slug; the
   * French overlay must NOT, because a title-cased slug is English-derived
   * text and would hide the gap from `report`. */
  name: string | null;
  description: string;
}

/**
 * The single scan behind both trait outputs -- the English `buildTraits`
 * below and the French overlay in `stages/i18n.ts`. Kept as one function so
 * the slug derivation can never drift between the two languages: the overlay
 * is joined to the English traits BY SLUG, so a second, subtly different
 * derivation would silently drop translations.
 */
export function scanTraits(lang: LangTable): ScannedTrait[] {
  const traits: ScannedTrait[] = [];

  for (const [key, description] of Object.entries(lang)) {
    if (!key.startsWith(TRAIT_DESCRIPTION_PREFIX)) continue;
    const suffix = key.slice(TRAIT_DESCRIPTION_PREFIX.length);
    if (suffix === "") continue;

    traits.push({
      slug: slugFromTraitDescriptionKey(suffix),
      name: lang[`${TRAIT_NAME_PREFIX}${suffix}`] ?? null,
      description: resolveLinks(resolveLocalize(description, lang)),
    });
  }

  return traits.sort((a, b) => compareStrings(a.slug, b.slug));
}

export function buildTraits(lang: LangTable): Trait[] {
  return scanTraits(lang).map((t) => ({
    slug: t.slug,
    name: t.name ?? titleCaseFromSlug(t.slug),
    description: t.description,
  }));
}
