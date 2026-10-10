import type {
  CreatureI18n,
  SpellDetail,
  SpellI18n,
  Vocabulary,
  VocabularyI18n,
} from "@pf2/schema";
import { extractRequirementsFr, extractTriggerFr } from "../normalize/html.js";
import { resolveLinks } from "../normalize/links.js";
import { resolveLocalize, type LangTable } from "../normalize/localize.js";
import type { ArchiveRecord } from "./archive.js";
import type { BabeleEntry, BabeleTable } from "./babele.js";
import type { ScannedTrait, ScannedVocabulary, VocabularyCategory } from "./reference.js";
import type { SpellDetailSource } from "./spells.js";
import { baseSpellName } from "../normalize/spellcasting.js";

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
 * One item's translated name/description, after preferring Babele's own
 * field over the archive's -- independently per field, so an item Babele
 * translated by name only (no body) still picks up the archive's
 * description without losing Babele's name. Task 2: 666 of the 2045 null
 * action descriptions sit on creatures Babele DOES cover, just not that one
 * item; this is what fills those in, without ever shadowing something
 * Babele already has.
 */
function mergedItem(
  babeleItem: { name?: string; description?: string } | undefined,
  archiveItem: { fr: string | null; description: string | null } | undefined,
): { name?: string; description?: string } {
  return {
    name: babeleItem?.name ?? archiveItem?.fr ?? undefined,
    description: babeleItem?.description ?? archiveItem?.description ?? undefined,
  };
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
 * `archive` is consulted at TWO levels, both keyed by foundry id, never by
 * position or name (same reason the Babele join above is id-keyed):
 *  - whole-creature: only when the Babele lookup returns nothing at all —
 *    Task 17.
 *  - per-item (Task 2): even when Babele DOES cover the creature, each
 *    individual action/attack item still falls back to the archive's OWN
 *    entry for that same foundry id when Babele's item field is missing.
 * Babele always wins at both levels: it is the live, actively maintained
 * translation, and the archive is retired data that exists purely to fill
 * the gaps Babele leaves. A field Babele already has is never shadowed by
 * an older archived one.
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
  /** The creature's spells flattened across its spellcasting entries, in
   * output order -- see `spellName`. Optional so every existing
   * caller/fixture without spells keeps working. */
  spells?: { name: string; foundryId: string }[];
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
  // Consulted regardless of where `entry` itself came from: when it came
  // from `fromArchive` above, `archiveItems` and `items` are already the
  // same data, so `mergedItem` below is a no-op there and only does real
  // work in the Task 2 case -- Babele covers the creature but not this item.
  const archiveItems = args.archive?.get(args.creatureFoundryId)?.items ?? {};

  return {
    name: entry.name,
    publicNotes: resolveFrench(entry.description, args.lang),
    actions: args.actions.map((action) => {
      const merged = mergedItem(items[action.foundryId], archiveItems[action.foundryId]);
      return {
        en: action.name,
        name: merged.name ?? null,
        description: resolveFrench(merged.description, args.lang),
        trigger: resolveFrenchField(merged.description, args.lang, extractTriggerFr),
        requirements: resolveFrenchField(merged.description, args.lang, extractRequirementsFr),
      };
    }),
    attacks: args.attacks.map((attack) => {
      const merged = mergedItem(items[attack.foundryId], archiveItems[attack.foundryId]);
      return { en: attack.name, name: merged.name ?? null };
    }),
    spells: (args.spells ?? []).map((spell) => ({
      en: spell.name,
      name: spellName(
        spell,
        mergedItem(items[spell.foundryId], archiveItems[spell.foundryId]),
        args.table,
      ),
    })),
  };
}

/**
 * A spell's French name, from the most specific source that has one:
 *  1. the creature's OWN Babele entry for that item (merged with the archive
 *     exactly like an action), which is the only source that translates a
 *     creature-specific name such as "Dimension Door (At Will)";
 *  2. otherwise the shared `spells-srd` Babele pack, by exact English name --
 *     but only for a name with NO parenthetical. "Tongues (Constant)" is not
 *     a key there, and translating just the "Tongues" part would silently
 *     drop the "(Constant)" qualifier from the French name;
 *  3. otherwise `null`, never the English name.
 * Together they name 6723 of the 6724 spell rows in the five books; the one
 * gap is the ancient umbral dragon spellcaster's "Finger of Death", a legacy
 * spell `spells-srd` no longer carries under that name.
 */
function spellName(
  spell: { name: string },
  merged: { name?: string },
  table: BabeleTable,
): string | null {
  if (merged.name !== undefined) return merged.name;
  if (spell.name.includes("(")) return null;
  return table.byPack.get("spells-srd")?.get(spell.name)?.name ?? null;
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
 * The Babele file stem for upstream's `actions` pack -- its Foundry
 * compendium id is `actionspf2e` (the same alias `PACK_ALIASES` in
 * normalize/links.ts maps back to `actions`).
 */
export const ACTIONS_BABELE_PACK = "actionspf2e";

/**
 * Standard-action name/slug pairs -> French name+description, read from
 * `pf2e.actionspf2e.json` ONLY. Babele keys that file by English name, so the
 * upstream English `name` is the join key, but scoped to that one file:
 * `lookup` would classify it as kind "other" and fall back across every
 * other "other" file -- feats, spells, equipment -- where a same-named entry
 * would either bleed in or make `lookup` throw on a disagreement that has
 * nothing to do with actions. Keyed by OUR slug, like `buildConditionsI18n`.
 * Untranslated entries are OMITTED, never echoed in English.
 */
export function buildStandardActionsI18n(
  defs: { slug: string; name: string }[],
  table: BabeleTable,
  lang: LangTable,
): ReferenceI18n {
  const entries = table.byPack.get(ACTIONS_BABELE_PACK);
  const out: ReferenceI18n = {};
  for (const def of defs) {
    const found = entries?.get(def.name);
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

/**
 * Vocabulary overlay: the same slugs as `vocabulary.json`, with French names
 * from the module's `lang/fr.json`, through the SAME `scanVocabulary` the
 * English build uses -- the traits approach, joined by slug, never by
 * display name.
 *
 * Only English slugs are kept: the French table also names things upstream's
 * English table does not (`Skill.Computers`, `Skill.Piloting`, 57 more
 * languages). A slug with no French name is OMITTED, never echoed in English
 * -- including the title-cased speeds `buildVocabulary` makes up (`Ice
 * Burrow`, `Air Walk`), which no French table names. An attribute is kept
 * only when the table has both its name and its short form.
 *
 * The one language gap today is `grippli`: the French table has moved that
 * key to the remaster's `tripkee`, which the pinned English table does not
 * carry yet. Joining the two would be a hand-made alias, so it stays out.
 */
export function buildVocabularyI18n(
  english: Vocabulary,
  french: ScannedVocabulary,
): VocabularyI18n {
  const pick = (category: VocabularyCategory): Record<string, string> => {
    const out: Record<string, string> = {};
    for (const slug of Object.keys(english[category])) {
      const name = french[category][slug];
      if (name !== undefined) out[slug] = name;
    }
    return out;
  };

  const attributes: VocabularyI18n["attributes"] = {};
  for (const id of Object.keys(english.attributes) as (keyof Vocabulary["attributes"])[]) {
    const { name, short } = french.attributes[id];
    if (name !== null && short !== null) attributes[id] = { name, short };
  }

  return {
    languages: pick("languages"),
    senses: pick("senses"),
    acuities: pick("acuities"),
    skills: pick("skills"),
    speeds: pick("speeds"),
    attributes,
    sizes: pick("sizes"),
    rarities: pick("rarities"),
  };
}

/**
 * One creature item's French name/description, through the same two-level
 * lookup `buildCreatureI18n` uses: the creature's Babele entry (own pack
 * first) or its archive record, then that item by Foundry id, Babele's field
 * winning over the archive's per field.
 */
function creatureItemFrench(args: {
  creatureName: string;
  creatureFoundryId: string;
  ownPack: string;
  foundryId: string;
  table: BabeleTable;
  archive?: ArchiveTable;
}): { name?: string; description?: string } {
  const entry =
    args.table.lookup("creature", args.ownPack, args.creatureName) ??
    fromArchive(args.archive, args.creatureFoundryId);
  const archiveItems = args.archive?.get(args.creatureFoundryId)?.items ?? {};
  return mergedItem(entry?.items?.[args.foundryId], archiveItems[args.foundryId]);
}

/** The Babele file stem for upstream's `spells` pack, whose Foundry
 * compendium id is `spells-srd` (`PACK_ALIASES` in normalize/links.ts). */
export const SPELLS_BABELE_PACK = "spells-srd";

/**
 * Spell details -> French, keyed by OUR slug, one file each. Never searched
 * by name across Babele files; each source is the one that translates THAT
 * text:
 *  - a compendium-sourced detail is looked up in `pf2e.spells-srd.json` ONLY,
 *    by the compendium spell's English name (Babele's key). That file also
 *    translates `range`, `target` and `duration`; each is taken only when
 *    the English detail has the field at all, so a French value can never
 *    appear where the English one is `null`;
 *  - an embedded detail is the creature's own copy, so its French is that
 *    creature item's translation (the copy the detail was built from first,
 *    then the slug's other copies), with the creature-side qualifier cut
 *    off the name the same way `baseSpellName` cuts the English one
 *    ("Voile (À volonté)" -> "Voile"). Creature item translations carry no
 *    range, target or duration, so those stay `null`. Not `spells-srd`: it
 *    is keyed by the remaster's names, and a legacy spell's English name
 *    (Dimension Door, Dancing Lights) is not in it.
 * A slug with no French name is OMITTED. A missing description, range,
 * target or duration is `null`, never the English text.
 */
export function buildSpellsI18n(
  details: SpellDetail[],
  sources: ReadonlyMap<string, SpellDetailSource>,
  table: BabeleTable,
  lang: LangTable,
  archive?: ArchiveTable,
): Record<string, SpellI18n> {
  const srd = table.byPack.get(SPELLS_BABELE_PACK);
  const out: Record<string, SpellI18n> = {};

  for (const detail of details) {
    const source = sources.get(detail.slug);
    if (source === undefined) throw new Error(`spell ${detail.slug} has no recorded source`);

    if (source.kind === "compendium") {
      const found = srd?.get(source.name) as
        | (BabeleEntry & { range?: string; target?: string; duration?: string })
        | undefined;
      if (!found) continue;
      const field = (english: string | null, french: string | undefined): string | null =>
        english === null ? null : resolveFrench(french, lang);
      out[detail.slug] = {
        name: found.name,
        description: resolveFrench(found.description, lang),
        range: field(detail.range, found.range),
        targets: field(detail.targets, found.target),
        duration: field(detail.duration, found.duration),
      };
      continue;
    }

    for (const copy of source.copies) {
      const merged = creatureItemFrench({
        creatureName: copy.creatureName,
        creatureFoundryId: copy.creatureFoundryId,
        ownPack: copy.creatureId.slice(0, copy.creatureId.indexOf("/")),
        foundryId: copy.foundryId,
        table,
        archive,
      });
      const name = merged.name === undefined ? "" : baseSpellName(merged.name);
      if (name === "") continue;
      out[detail.slug] = {
        name,
        description: resolveFrench(merged.description, lang),
        range: null,
        targets: null,
        duration: null,
      };
      break;
    }
  }

  return out;
}
