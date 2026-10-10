import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import {
  AttributeSlugSchema,
  CreatureSchema,
  type AttributeSlug,
  type Condition,
  type Creature,
  type GlossaryEntry,
  type StandardAction,
  type Trait,
  type Vocabulary,
} from "@pf2/schema";
import { walkPack } from "../io/walk.js";
import { describeItem, itemHasType } from "../normalize/item.js";
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

const StandardActionItemSchema = z.object({
  name: z.string(),
  type: z.literal("action"),
  system: z.object({
    slug: z.string().nullish(),
    actionType: z.object({
      value: z.enum(["action", "reaction", "free", "passive"]),
    }),
    actions: z.object({ value: z.number().nullable() }).optional(),
    description: z.object({ value: z.string().default("") }),
    traits: z.object({ value: z.array(z.string()).default([]) }).optional(),
  }),
});

/**
 * The two folders of upstream's `actions` pack that hold PF2's standard
 * actions, keyed by the subdirectory Foundry's pack extractor writes each
 * folder to ("Basic Actions" -> `basic-actions/`, "Skill Actions" ->
 * `skill-actions/`), so selection is by a stable path segment, never by the
 * folder's display name. The rest of the pack -- ~790 class, archetype and
 * ancestry actions -- sits loose at the pack root and is never read.
 */
export const STANDARD_ACTION_FOLDERS: Record<StandardAction["category"], string> = {
  basic: "basic-actions",
  skill: "skill-actions",
};

/**
 * Basic actions the app already models on its own: Delay is the initiative
 * tracker's Delay control, and Strike is each creature's own list of Strikes
 * with their real bonuses -- a generic "Strike" row next to them would only
 * duplicate them without the numbers.
 */
export const EXCLUDED_STANDARD_ACTIONS = new Set(["delay", "strike"]);

/**
 * PF2's standard actions (Stride, Step, Shove, Demoralize, Raise a Shield,
 * ...) from the `basic-actions/` and `skill-actions/` folders of each
 * `actions`-kind pack -- 51 of their 74 items at the pinned SHA (24 basic,
 * 27 skill). Dropped: every `passive` entry (21, all skill actions: Earn
 * Income, Treat Wounds, Coerce, ... -- exploration and downtime activities
 * Foundry types as passive, not usable in an encounter) and the two
 * `EXCLUDED_STANDARD_ACTIONS`.
 *
 * Unlike `buildGlossary`, a file that fails validation THROWS rather than
 * being skipped: every file in these two folders is meant to be an action,
 * so a skip would silently delete Shove from the list with no report line.
 * So does a non-passive `action` with no 1-3 action count -- there is no
 * `"passive"` cost to fall back to here.
 *
 * Descriptions get the same treatment as creature actions: `@Localize`
 * first, then link resolution.
 */
export function buildStandardActions(
  packsDir: string,
  lang: LangTable,
  packs: string[],
): StandardAction[] {
  const actions: StandardAction[] = [];

  for (const pack of packs) {
    for (const [category, folder] of Object.entries(STANDARD_ACTION_FOLDERS) as [
      StandardAction["category"],
      string,
    ][]) {
      for (const file of walkPack(join(packsDir, pack, folder))) {
        const raw: unknown = JSON.parse(readFileSync(file.absolutePath, "utf8"));
        const where = `${pack}/${folder}/${file.slug}`;
        const parsed = StandardActionItemSchema.safeParse(raw);
        if (!parsed.success) {
          throw new Error(
            itemHasType(raw, "action")
              ? `standard action ${where} (${describeItem(raw)}) failed validation: ${
                  parsed.error.issues[0]?.message ?? "invalid"
                } (at ${parsed.error.issues[0]?.path.join(".") ?? "?"})`
              : `standard action ${where} is not an action item`,
          );
        }
        const { name, system } = parsed.data;

        const kind = system.actionType.value;
        if (kind === "passive") continue;
        const slug = system.slug ? system.slug : file.slug;
        if (EXCLUDED_STANDARD_ACTIONS.has(slug)) continue;

        let cost: StandardAction["cost"];
        if (kind !== "action") {
          cost = kind;
        } else {
          const n = system.actions?.value;
          if (n !== 1 && n !== 2 && n !== 3) {
            throw new Error(
              `standard action ${where} is an action with no 1-3 action count (got ${String(n)})`,
            );
          }
          cost = String(n) as StandardAction["cost"];
        }

        actions.push({
          slug,
          name,
          cost,
          category,
          traits: [...(system.traits?.value ?? [])].sort(compareStrings),
          description: resolveLinks(resolveLocalize(system.description.value, lang)),
        });
      }
    }
  }

  actions.sort((a, b) => compareStrings(a.slug, b.slug));
  // The French overlay is keyed by slug, so two actions sharing one would
  // have one silently take the other's translation.
  for (let i = 1; i < actions.length; i++) {
    if (actions[i]!.slug === actions[i - 1]!.slug) {
      throw new Error(`standard action slug "${actions[i]!.slug}" appears twice`);
    }
  }
  return actions;
}

const TRAIT_DESCRIPTION_PREFIX = "PF2E.TraitDescription";
const TRAIT_NAME_PREFIX = "PF2E.Trait";

/** `TraitDescriptionAwakenedAnimal` -> `awakened-animal`, `TraitDescriptionSplash10`
 * -> `splash-10`: a hyphen before every internal uppercase letter and before
 * every letter-to-digit boundary, then lowercased. Checked against the real
 * 426-key list before relying on it — no acronyms, only one digit-bearing
 * suffix (Splash10), no collisions. The vocabulary keys below
 * (`Sense.Type.LowLightVision` -> `low-light-vision`) go through it too. */
function slugFromPascalCase(suffix: string): string {
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
      slug: slugFromPascalCase(suffix),
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

/** The vocabulary categories that are plain `slug -> name` records. */
export type VocabularyCategory = Exclude<keyof Vocabulary, "attributes">;

/**
 * The lang-table families behind the scanned vocabulary categories: every
 * key directly under `prefix`. Languages are keyed by their slug itself
 * (`Language.aklo`, `Language.elder-thing`), so only an all-lowercase suffix
 * counts -- the PascalCase siblings (`CommonLanguage`, `Plural`,
 * `DetailsPlaceholder`) are UI strings. Everything else is keyed in
 * PascalCase and slugged like a trait (`Sense.Type.SeeInvisibility` ->
 * `see-invisibility`), with each family's `Label` key left out.
 */
const VOCABULARY_FAMILIES: Record<
  Exclude<VocabularyCategory, "rarities">,
  { prefix: string; slug: (suffix: string) => string | null }
> = {
  languages: { prefix: "PF2E.Actor.Creature.Language.", slug: languageSlug },
  senses: { prefix: "PF2E.Actor.Creature.Sense.Type.", slug: pascalSlug },
  acuities: { prefix: "PF2E.Actor.Creature.Sense.Acuity.", slug: pascalSlug },
  skills: { prefix: "PF2E.Skill.", slug: pascalSlug },
  speeds: { prefix: "PF2E.Actor.Speed.Type.", slug: pascalSlug },
  sizes: { prefix: "PF2E.ActorSize", slug: pascalSlug },
};

function languageSlug(suffix: string): string | null {
  return /^[a-z]+(?:-[a-z]+)*$/.test(suffix) ? suffix : null;
}

function pascalSlug(suffix: string): string | null {
  if (!/^[A-Z][A-Za-z]*$/.test(suffix) || suffix === "Label") return null;
  return slugFromPascalCase(suffix);
}

/** `str` -> `Str`, the casing both attribute key families use. */
function capitalize(slug: string): string {
  return slug[0]!.toUpperCase() + slug.slice(1);
}

/**
 * One lang table's vocabulary, before the English build fills or rejects
 * its gaps. Attributes keep a missing half as `null` rather than dropping
 * the attribute: English must have both and throws, French omits the
 * attribute -- see `buildVocabulary` and `buildVocabularyI18n`.
 */
export type ScannedVocabulary = Record<VocabularyCategory, Record<string, string>> & {
  attributes: Record<AttributeSlug, { name: string | null; short: string | null }>;
};

/**
 * The single scan behind both vocabulary outputs -- the English
 * `buildVocabulary` below and the French overlay in `stages/i18n.ts` --
 * for the same reason `scanTraits` is one function: the overlay is joined
 * to the English vocabulary BY SLUG, so both sides must derive slugs the
 * same way.
 *
 * Rarities have no key family of their own (`PF2E.TraitUnique` sits among
 * every other trait name), so they are looked up for the four slugs
 * `Creature.rarity` allows. Attributes are looked up for the six
 * `abilityMods` keys: `PF2E.AbilityStr` for the name, `PF2E.AbilityId.str`
 * for the short form ("Str"; "For" in French).
 */
export function scanVocabulary(lang: LangTable): ScannedVocabulary {
  const scanned = {
    languages: {},
    senses: {},
    acuities: {},
    skills: {},
    speeds: {},
    sizes: {},
    rarities: {},
  } as Record<VocabularyCategory, Record<string, string>>;

  for (const [key, name] of Object.entries(lang)) {
    for (const [category, family] of Object.entries(VOCABULARY_FAMILIES)) {
      if (!key.startsWith(family.prefix)) continue;
      const slug = family.slug(key.slice(family.prefix.length));
      if (slug !== null) scanned[category as VocabularyCategory][slug] = name;
    }
  }

  for (const rarity of CreatureSchema.shape.rarity.options) {
    const name = lang[`PF2E.Trait${capitalize(rarity)}`];
    if (name !== undefined) scanned.rarities[rarity] = name;
  }

  const attributes = {} as ScannedVocabulary["attributes"];
  for (const id of AttributeSlugSchema.options) {
    attributes[id] = {
      name: lang[`PF2E.Ability${capitalize(id)}`] ?? null,
      short: lang[`PF2E.AbilityId.${id}`] ?? null,
    };
  }

  return { ...scanned, attributes };
}

/**
 * `vocabulary.json`: display names for the slugs a creature's stat block is
 * stored as, from `static/lang/en.json` via `scanVocabulary` -- every slug
 * upstream names in each family, not just the ones today's creatures use
 * (119 languages to the 49 in use), like `buildTraits`.
 *
 * Speeds are the one category upstream leaves open: a speed's `type` is
 * free text on a legacy actor (see `speedTypeSlug` in normalize/defenses.ts),
 * so a speed some creature uses with no lang key -- `ice-burrow`,
 * `air-walk` -- gets a title-cased slug, as a trait with no name key does.
 * Every other category is closed upstream, so a creature slug with no lang
 * key is left missing for `verifyVocabulary` to report.
 *
 * Throws when an attribute lacks either English name: there are only six and
 * the stat block always shows them.
 */
export function buildVocabulary(lang: LangTable, creatures: Creature[]): Vocabulary {
  const { attributes: scannedAttributes, ...scanned } = scanVocabulary(lang);

  for (const creature of creatures) {
    for (const speed of creature.speeds) {
      scanned.speeds[speed.type] ??= titleCaseFromSlug(speed.type);
    }
  }

  const attributes = {} as Vocabulary["attributes"];
  for (const id of AttributeSlugSchema.options) {
    const { name, short } = scannedAttributes[id];
    if (name === null || short === null) {
      throw new Error(
        `attribute ${id} has no ${name === null ? `PF2E.Ability${capitalize(id)}` : `PF2E.AbilityId.${id}`} in the lang table`,
      );
    }
    attributes[id] = { name, short };
  }

  return { ...scanned, attributes };
}
