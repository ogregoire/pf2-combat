import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import type { SpellDetail } from "@pf2/schema";
import { walkPack } from "../io/walk.js";
import { stableStringify } from "../io/write.js";
import { describeItem, itemHasType } from "../normalize/item.js";
import { resolveLinks } from "../normalize/links.js";
import { resolveLocalize, type LangTable } from "../normalize/localize.js";
import { baseSpellName, compendiumSpellId } from "../normalize/spellcasting.js";
import { compareStrings } from "../util.js";

const CompendiumEntrySchema = z.object({
  _id: z.string(),
  name: z.string(),
  type: z.literal("spell"),
  system: z.object({ slug: z.string().nullish() }),
});

/** One spell of upstream's `spells` pack (Foundry id `spells-srd`). */
export interface CompendiumSpell {
  id: string;
  /** `system.slug`, else the file stem -- the same rule as
   * `buildStandardActions`. No compendium spell sets `system.slug` at the
   * pinned SHA, and every stem is its name slugified. */
  slug: string;
  /** The English name, which is also the key of the French `spells-srd`
   * Babele file. */
  name: string;
  item: unknown;
}

export interface CompendiumSpells {
  byId: ReadonlyMap<string, CompendiumSpell>;
  bySlug: ReadonlyMap<string, CompendiumSpell>;
}

/**
 * Reads every spell of each `spells`-kind pack -- 1716 files at the pinned
 * SHA, in one folder per rank plus `cantrip/`, `focus/` and `ritual/`. All
 * of them are indexed (a creature can reference any), but only the ones a
 * creature row references are ever emitted.
 *
 * Every file in the pack is meant to be a spell, so one that is not THROWS
 * instead of being skipped, as in `buildStandardActions`. So does a slug or
 * an id seen twice: both are join keys, and a duplicate would silently hand
 * one spell's text to the other.
 */
export function loadCompendiumSpells(packsDir: string, packs: string[]): CompendiumSpells {
  const byId = new Map<string, CompendiumSpell>();
  const bySlug = new Map<string, CompendiumSpell>();

  for (const pack of packs) {
    for (const file of walkPack(join(packsDir, pack))) {
      const raw: unknown = JSON.parse(readFileSync(file.absolutePath, "utf8"));
      const parsed = CompendiumEntrySchema.safeParse(raw);
      if (!parsed.success) {
        throw new Error(
          itemHasType(raw, "spell")
            ? `compendium spell ${pack}/${file.slug} (${describeItem(raw)}) failed validation: ${
                parsed.error.issues[0]?.message ?? "invalid"
              } (at ${parsed.error.issues[0]?.path.join(".") ?? "?"})`
            : `compendium spell ${pack}/${file.slug} is not a spell item`,
        );
      }
      const { _id, name, system } = parsed.data;
      const spell: CompendiumSpell = {
        id: _id,
        slug: system.slug ? system.slug : file.slug,
        name,
        item: raw,
      };
      if (byId.has(spell.id)) throw new Error(`compendium spell id ${spell.id} appears twice`);
      if (bySlug.has(spell.slug)) {
        throw new Error(`compendium spell slug "${spell.slug}" appears twice`);
      }
      byId.set(spell.id, spell);
      bySlug.set(spell.slug, spell);
    }
  }

  return { byId, bySlug };
}

/** Compendium id -> slug, the shape `normalizeSpellcasting` takes. */
export function compendiumSpellSlugs(compendium: CompendiumSpells): Map<string, string> {
  return new Map([...compendium.byId].map(([id, spell]) => [id, spell.slug]));
}

/**
 * Every field a detail reads, in the one shape all 8251 non-ritual spell
 * items share across the compendium and the five books' creatures. Fields
 * left out (`area.details`, `defense.passive`, `heightening`, `overlays`)
 * are not part of `SpellDetail`.
 */
const SpellDetailItemSchema = z.object({
  name: z.string(),
  type: z.literal("spell"),
  system: z.object({
    level: z.object({ value: z.number().int() }),
    traits: z.object({
      value: z.array(z.string()).default([]),
      traditions: z.array(z.string()).default([]),
    }),
    time: z.object({ value: z.string() }),
    range: z.object({ value: z.string().nullish() }).nullish(),
    area: z.object({ type: z.string(), value: z.number() }).nullish(),
    target: z.object({ value: z.string().nullish() }).nullish(),
    defense: z
      .object({
        save: z
          .object({
            statistic: z.enum(["fortitude", "reflex", "will"]),
            basic: z.boolean(),
          })
          .nullish(),
      })
      .nullish(),
    duration: z
      .object({ value: z.string().nullish(), sustained: z.boolean().default(false) })
      .nullish(),
    description: z.object({ value: z.string().default("") }),
    heightening: z.unknown().optional(),
  }),
});

const textOrNull = (value: string | null | undefined): string | null =>
  value === null || value === undefined || value.trim() === "" ? null : value;

/** `Heightened (+1)`, `Heightened (3rd)`: how upstream writes heightening
 * into a description. */
const HEIGHTENED_TEXT = /\bHeightened\b/;

function toDetail(
  item: unknown,
  slug: string,
  name: string,
  lang: LangTable,
  where: string,
): { detail: SpellDetail; heighteningOnly: boolean } {
  const parsed = SpellDetailItemSchema.safeParse(item);
  if (!parsed.success) {
    throw new Error(
      `spell ${where} (${describeItem(item)}) failed validation: ${
        parsed.error.issues[0]?.message ?? "invalid"
      } (at ${parsed.error.issues[0]?.path.join(".") ?? "?"})`,
    );
  }
  const { system } = parsed.data;
  const save = system.defense?.save ?? null;
  const description = resolveLinks(resolveLocalize(system.description.value, lang));

  return {
    detail: {
      slug,
      name,
      rank: system.level.value,
      cantrip: system.traits.value.includes("cantrip"),
      traits: [...system.traits.value].sort(compareStrings),
      traditions: [...system.traits.traditions].sort(compareStrings),
      cost: system.time.value,
      range: textOrNull(system.range?.value),
      area: system.area ? { type: system.area.type, value: system.area.value } : null,
      targets: textOrNull(system.target?.value),
      defense: save === null ? null : { save: save.statistic, basic: save.basic },
      duration: textOrNull(system.duration?.value),
      sustained: system.duration?.sustained ?? false,
      description,
    },
    heighteningOnly:
      system.heightening !== undefined &&
      system.heightening !== null &&
      !HEIGHTENED_TEXT.test(system.description.value),
  };
}

/** One creature's copy of a spell, behind one or more of its spell rows. */
export interface SpellCopy {
  creatureId: string;
  creatureName: string;
  creatureFoundryId: string;
  /** The spell item's own Foundry id on that creature. */
  foundryId: string;
  slug: string;
  item: unknown;
}

/** Where a detail came from -- also what the French overlay joins on. */
export type SpellDetailSource =
  | { kind: "compendium"; name: string }
  /** `copies` in preference order: the copy the detail was built from first,
   * then every other copy of the slug in creature-id order. */
  | { kind: "embedded"; copies: SpellCopy[] };

export interface SpellDetailsBuild {
  /** Sorted by slug. */
  details: SpellDetail[];
  sources: Map<string, SpellDetailSource>;
  stats: {
    compendium: number;
    embedded: number;
    /** Copies (one per creature and item) behind a compendium detail... */
    compendiumCopies: number;
    /** ...and how many of those carry a description that is not
     * byte-identical to the compendium spell's. Counted, not reconciled. */
    differingCopies: number;
    /** Copies whose compendium source id names a spell under a DIFFERENT
     * slug -- a legacy spell the remaster renamed. */
    renamedCopies: number;
    /** Details whose source item heightens through `system.heightening`
     * without a single "Heightened" entry in its description. */
    heighteningOnly: number;
  };
}

/**
 * One `SpellDetail` per distinct slug the creatures' spell rows reference.
 *
 * The canonical compendium spell wins wherever one carries the slug -- found
 * by a copy's compendium source id when that spell's slug agrees, else by
 * slug alone (the two agree on every copy today). A copy whose source id
 * names a spell under ANOTHER slug is a legacy spell the remaster renamed --
 * 978 copies, e.g. "dimension-door" items sourced from what is now
 * Translocate -- and is not given the renamed spell's text: the creature row
 * says Dimension Door, so its detail has to describe Dimension Door.
 *
 * With no compendium spell for the slug, the detail comes from the
 * creatures' own embedded copies. Those are not uniform: upstream edits a
 * creature's copy in place (the adult magma dragon's Burning Hands deals a
 * pre-heightened 12d6; the shaitan's Veil targets only itself), so the copy
 * used is the MOST COMMON one, by the whole normalised detail, ties going to
 * the first in creature-id order. 16 of the 99 embedded slugs (1071 copies)
 * have more than one description variant today.
 *
 * At the pinned SHA: 536 details, 437 from the compendium and 99 embedded;
 * 1740 of the 5586 creature copies behind a compendium detail have a
 * description that differs from it (counted, not reconciled -- the
 * compendium text is the one shipped).
 */
export function buildSpellDetails(
  copiesByRow: SpellCopy[],
  compendium: CompendiumSpells,
  lang: LangTable,
): SpellDetailsBuild {
  // A prepared spell held at two ranks is two rows but one copy: dedupe so
  // it cannot vote twice for its own variant.
  const bySlug = new Map<string, SpellCopy[]>();
  const seen = new Set<string>();
  for (const copy of copiesByRow) {
    const key = `${copy.creatureId}\0${copy.foundryId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const list = bySlug.get(copy.slug) ?? [];
    list.push(copy);
    bySlug.set(copy.slug, list);
  }

  const details: SpellDetail[] = [];
  const sources = new Map<string, SpellDetailSource>();
  const stats: SpellDetailsBuild["stats"] = {
    compendium: 0,
    embedded: 0,
    compendiumCopies: 0,
    differingCopies: 0,
    renamedCopies: 0,
    heighteningOnly: 0,
  };

  for (const slug of [...bySlug.keys()].sort(compareStrings)) {
    const copies = bySlug.get(slug)!;

    let canonical: CompendiumSpell | undefined;
    for (const copy of copies) {
      const raw = copy.item as {
        _stats?: { compendiumSource?: string | null } | null;
        flags?: { core?: { sourceId?: string | null } | null } | null;
      };
      const id = compendiumSpellId(raw._stats?.compendiumSource ?? raw.flags?.core?.sourceId);
      const source = id === null ? undefined : compendium.byId.get(id);
      if (source === undefined) continue;
      if (source.slug === slug) canonical ??= source;
      else stats.renamedCopies += 1;
    }
    canonical ??= compendium.bySlug.get(slug);

    if (canonical !== undefined) {
      const built = toDetail(canonical.item, slug, canonical.name, lang, `spells/${slug}`);
      details.push(built.detail);
      sources.set(slug, { kind: "compendium", name: canonical.name });
      stats.compendium += 1;
      if (built.heighteningOnly) stats.heighteningOnly += 1;
      const canonicalText = descriptionOf(canonical.item);
      stats.compendiumCopies += copies.length;
      stats.differingCopies += copies.filter((c) => descriptionOf(c.item) !== canonicalText).length;
      continue;
    }

    const variants = new Map<string, { count: number; first: number; built: ReturnType<typeof toDetail> }>();
    copies.forEach((copy, index) => {
      const name = baseSpellName((copy.item as { name?: string }).name ?? "");
      const built = toDetail(copy.item, slug, name, lang, `${copy.creatureId} -> ${slug}`);
      const key = stableStringify(built.detail);
      const hit = variants.get(key);
      if (hit) hit.count += 1;
      else variants.set(key, { count: 1, first: index, built });
    });
    let best: { count: number; first: number; built: ReturnType<typeof toDetail> } | null = null;
    for (const variant of variants.values()) {
      if (best === null || variant.count > best.count) best = variant;
    }
    // `variants` iterates in insertion order, i.e. by first occurrence, and
    // only a STRICTLY larger count replaces `best`: a tie keeps the earlier.
    const chosen = best!;
    details.push(chosen.built.detail);
    sources.set(slug, {
      kind: "embedded",
      copies: [copies[chosen.first]!, ...copies.filter((_, i) => i !== chosen.first)],
    });
    stats.embedded += 1;
    if (chosen.built.heighteningOnly) stats.heighteningOnly += 1;
  }

  return { details, sources, stats };
}

function descriptionOf(item: unknown): string | undefined {
  return (item as { system?: { description?: { value?: string } } }).system?.description?.value;
}
