import type { CreatureI18n } from "@pf2/schema";
import { extractRequirementsFr, extractTriggerFr } from "../normalize/html.js";
import { resolveLinks } from "../normalize/links.js";
import { resolveLocalize, type LangTable } from "../normalize/localize.js";
import type { ArchiveRecord } from "./archive.js";
import type { BabeleEntry, BabeleTable } from "./babele.js";
import type { ScannedTrait } from "./reference.js";

/**
 * Retired-module fallback, keyed by `Creature.foundryId` -- Task 17. Foundry
 * ids are unique across the whole module, so this is a flat table, unlike
 * `BabeleTable.byPack`.
 */
export type ArchiveTable = ReadonlyMap<string, ArchiveRecord>;

/**
 * Adapts one archive record into the same shape `BabeleTable.lookup` returns,
 * so both sources feed the same downstream code (item alignment by foundry
 * id, then `resolveFrench`). `null` when the record itself has no French
 * name -- 634 of 1350 legacy records have no body, and 2 child items have an
 * empty `Nom:`; either way that is "no translation", never the English name
 * standing in for one.
 */
function fromArchive(
  archive: ArchiveTable | undefined,
  foundryId: string,
): BabeleEntry | null {
  const record = archive?.get(foundryId);
  if (record === undefined || record.fr === null) return null;

  const items: Record<string, { name?: string; description?: string }> = {};
  for (const [id, item] of Object.entries(record.items)) {
    items[id] = {
      name: item.fr ?? undefined,
      description: item.description ?? undefined,
    };
  }

  return { name: record.fr, description: record.description ?? undefined, items };
}

/**
 * `[[/act balance]]{label}` and friends are ordinary Foundry enrichers -- 416
 * in the English dataset, 247 in the French, and both pipelines leave them for
 * the app to render. One French entry (pathfinder-npc-core/harbormaster)
 * writes a stray `@` in front of one, which is not valid in any Foundry syntax
 * and renders as a literal `@` to the GM. English has zero `@[`, so this
 * repair is French-only by construction, and it is deliberately narrow: a
 * broader `@(?=\[)` would turn an unknown `@[…]` marker into ordinary bracket
 * text and hide it from `verifyI18nMarkup` instead of surfacing it.
 */
const STRAY_ENRICHER_AT = /@(?=\[\[)/g;

/**
 * Babele stores RAW Foundry text, so every French description arrives with
 * the same two markup families the English pipeline strips:
 * `@Localize[KEY]` glossary includes and `@UUID[...]{label}` cross-references.
 * Left alone they render literally to the GM
 * (`@UUID[Compendium.pf2e.actionspf2e.Item.BlAOM2X92SI6HMtJ]{Cherchez}`).
 *
 * Same two passes, in the same order, as `normalizeCreature`: localize first,
 * because the text a glossary key expands to itself contains `@UUID`
 * references that must survive to be resolved by the second pass.
 *
 * `lang` is the FRENCH table (`lang/fr.json`). Resolving against the English
 * one would drop English prose into otherwise-French text -- worse than
 * leaving the marker in place, because it looks correct.
 *
 * `@Check`, `@Damage` and `@Template` are deliberately left alone: the
 * English dataset carries them too, and the app renders them. So are
 * `[[/act …]]` enrichers -- see `STRAY_ENRICHER_AT` above.
 */
function resolveFrench(html: string | null | undefined, lang: LangTable): string | null {
  if (html === null || html === undefined) return null;
  return resolveLinks(resolveLocalize(html, lang)).replace(STRAY_ENRICHER_AT, "");
}

/**
 * Same two passes as `resolveFrench` (localize, then link references), but
 * around one of the extractors above instead of around the whole
 * description -- 537 French action descriptions carry a
 * `<strong>Déclencheur</strong>` paragraph with the same structure as the
 * English Trigger paragraph `normalizeActions` already pulls out, just with
 * a translated label. Localizing BEFORE extracting mirrors the English
 * pipeline (`extractTrigger(resolveLocalize(html, lang))` in
 * normalize/actions.ts), in case a `@Localize` include ever lands inside
 * the trigger/requirements paragraph itself.
 */
function resolveFrenchField(
  html: string | null | undefined,
  lang: LangTable,
  extract: (html: string) => string | null,
): string | null {
  if (html === null || html === undefined) return null;
  const extracted = extract(resolveLocalize(html, lang));
  if (extracted === null) return null;
  return resolveLinks(extracted).replace(STRAY_ENRICHER_AT, "");
}

/**
 * Builds a creature's French overlay by aligning Babele's per-item
 * translations (keyed by Foundry item id) to the SAME sorted
 * actions/attacks arrays the English creature already uses — by array
 * position, never by name. 156 real creatures carry two Strikes of the same
 * English name (a melee and a thrown Dagger, Hatchet or Spear); a name key
 * would silently collapse them onto one translation.
 *
 * The creature entry itself is resolved via `BabeleTable.lookup`, NEVER a
 * flat name lookup: `Shambler` is "Tertre errant" in the Kingmaker bestiary
 * but "Grand tertre" in Bestiary 1, and `Guard` names both a creature and an
 * action. `lookup`'s own-pack-first, kind-scoped resolution is exactly what
 * keeps those apart; bypassing it here would reintroduce both collisions.
 *
 * Absent creature, or absent item translation, both yield `null` rather
 * than the English text: a missing translation must stay visible to
 * `report`, not be hidden by a silent fallback.
 *
 * `archive` is consulted ONLY when the Babele lookup above returns nothing —
 * Task 17. Babele always wins: it is the live, actively maintained
 * translation, and the archive is retired data that exists purely to fill
 * the gap Babele leaves. A creature Babele already covers must never have
 * its translation shadowed by an older archived one.
 */
export function buildCreatureI18n(args: {
  creatureName: string;
  /** Joins to the archive fallback — see `fromArchive`. Unused when
   * Babele already covers the creature. */
  creatureFoundryId: string;
  /** The pack this creature ships in — `lookup` prefers its translation. */
  ownPack: string;
  actions: { name: string; foundryId: string }[];
  attacks: { name: string; foundryId: string }[];
  table: BabeleTable;
  /** The FRENCH lang table, for `@Localize` resolution. See `resolveFrench`. */
  lang: LangTable;
  /** Retired-module fallback, consulted only on a Babele miss. Optional so
   * every existing caller/fixture that has no archive keeps working. */
  archive?: ArchiveTable;
}): CreatureI18n | null {
  const entry =
    args.table.lookup("creature", args.ownPack, args.creatureName) ??
    fromArchive(args.archive, args.creatureFoundryId);
  if (!entry) return null;

  const items = entry.items ?? {};

  return {
    name: entry.name,
    publicNotes: resolveFrench(entry.description, args.lang),
    actions: args.actions.map((action) => ({
      en: action.name,
      name: items[action.foundryId]?.name ?? null,
      description: resolveFrench(items[action.foundryId]?.description, args.lang),
      trigger: resolveFrenchField(items[action.foundryId]?.description, args.lang, extractTriggerFr),
      requirements: resolveFrenchField(
        items[action.foundryId]?.description,
        args.lang,
        extractRequirementsFr,
      ),
    })),
    attacks: args.attacks.map((attack) => ({
      en: attack.name,
      name: items[attack.foundryId]?.name ?? null,
    })),
  };
}

/**
 * Search-index overlay: id -> French name, for creatures the Babele table
 * covers. Resolved via `table.lookup("creature", ownPack, name)`, NEVER a
 * flat name lookup, and `ownPack` is derived from the entry's OWN id rather
 * than passed in: `Shambler` is "Tertre errant" in the Kingmaker bestiary
 * pack and "Grand tertre" in Bestiary 1, so the same English name must
 * resolve differently depending on which pack's entry is being indexed. An
 * id's pack is everything before the first `/` (`kingmaker-bestiary/the-
 * stag-lord` -> `kingmaker-bestiary`).
 *
 * A creature neither source covers is OMITTED, never given its English name
 * as a stand-in -- a missing translation must stay visible to `report`, not
 * be hidden by a silent fallback. `archive` is a Babele-miss-only fallback,
 * same as `buildCreatureI18n` -- see `fromArchive`.
 */
export function buildIndexI18n(
  entries: { id: string; name: string; foundryId: string }[],
  table: BabeleTable,
  archive?: ArchiveTable,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const entry of entries) {
    const ownPack = entry.id.slice(0, entry.id.indexOf("/"));
    const found =
      table.lookup("creature", ownPack, entry.name) ?? fromArchive(archive, entry.foundryId);
    if (found) out[entry.id] = found.name;
  }
  return out;
}

/**
 * Conditions and monster-ability-glossary entries have no per-entry "home
 * pack" the way a creature has its own bestiary -- they're each just one
 * (conditions) or two (glossary) Babele files with no natural preference
 * between them. Passing a pack name that can't exist in the table skips the
 * own-pack shortcut and goes straight to `lookup`'s kind-scoped search
 * across every file of that kind, which throws if the sources disagree --
 * the same protection a real own pack gives the creature builder.
 */
const NO_OWN_PACK = "";

/** slug -> French name/description, the shape `useTraitGlossary` looks up
 * by slug for the app's hover tooltips. `description` is nullable: some
 * entries (`Grab` -> "Agrippement") are translated by name only, with no
 * French body -- that gap must reach `report` as `null`, never be papered
 * over with the English text. */
export type ReferenceI18n = Record<string, { name: string; description: string | null }>;

/**
 * Condition name/slug pairs -> French name+description, resolved under the
 * "condition" kind so a name that also happens to be a creature or glossary
 * entry (`Guard` names both a creature and an action) can never bleed in.
 * The English `name` is only the JOIN key into Babele; the OUTPUT is keyed
 * by OUR slug, because that's what `useTraitGlossary` looks up by --
 * name-keying here would just force a re-keying pass in the app.
 * Untranslated entries are OMITTED, never echoed in English.
 */
export function buildConditionsI18n(
  defs: { slug: string; name: string }[],
  table: BabeleTable,
  lang: LangTable,
): ReferenceI18n {
  const out: ReferenceI18n = {};
  for (const def of defs) {
    const found = table.lookup("condition", NO_OWN_PACK, def.name);
    if (found) {
      out[def.slug] = { name: found.name, description: resolveFrench(found.description, lang) };
    }
  }
  return out;
}

/**
 * Glossary-entry name/slug pairs -> French name+description, resolved
 * under the "glossary" kind (the monster-ability glossary), never pooled
 * with conditions or creatures. Keyed by OUR slug for the same reason as
 * `buildConditionsI18n`. Untranslated entries are OMITTED, never echoed in
 * English.
 */
export function buildGlossaryI18n(
  defs: { slug: string; name: string }[],
  table: BabeleTable,
  lang: LangTable,
): ReferenceI18n {
  const out: ReferenceI18n = {};
  for (const def of defs) {
    const found = table.lookup("glossary", NO_OWN_PACK, def.name);
    if (found) {
      out[def.slug] = { name: found.name, description: resolveFrench(found.description, lang) };
    }
  }
  return out;
}

/**
 * Trait overlay: our slug -> French name/description, for the traits we
 * actually ship. Unlike conditions and glossary entries, traits do not come
 * from Babele at all -- they come from the module's own `lang/fr.json`, via
 * the SAME `scanTraits` the English `buildTraits` uses, so the slugs on both
 * sides are derived identically and the join by slug cannot drift.
 *
 * The French table carries more traits than we ship (535 descriptions to our
 * 426), so `slugs` filters it down to ours. Two gaps are represented rather
 * than filled:
 *  - no French description at all -> the trait is OMITTED (3 today: `gnoll`,
 *    `grippli`, `environment`, all remaster renames, so the app's English
 *    fallback is the right answer);
 *  - a French description but no `PF2E.Trait<Suffix>` display name -> `name`
 *    is `null` (10 today). `buildTraits` substitutes a title-cased slug
 *    there, which is English-derived text and must never be written into a
 *    French file.
 */
export function buildTraitsI18n(
  slugs: string[],
  frenchTraits: ScannedTrait[],
): Record<string, { name: string | null; description: string }> {
  const bySlug = new Map(frenchTraits.map((t) => [t.slug, t]));
  const out: Record<string, { name: string | null; description: string }> = {};

  for (const slug of slugs) {
    const found = bySlug.get(slug);
    if (!found) continue;
    out[slug] = { name: found.name, description: found.description };
  }

  return out;
}
