import { z } from "zod";
import { compareStrings } from "../util.js";
import { describeItem, itemHasType } from "./item.js";

const EntryItemSchema = z.object({
  _id: z.string(),
  name: z.string(),
  type: z.literal("spellcastingEntry"),
  system: z.object({
    prepared: z.object({ value: z.string() }),
    // Every slot shape upstream actually uses, in one schema:
    //  - spontaneous/innate: `{ max, value }`;
    //  - prepared: `{ max, prepared: [{ id }] }`, with NO `value`. Requiring
    //    `value` here once silently dropped every prepared entry (140 across
    //    the five books, e.g. the adult adamantine dragon spellcaster's
    //    "Primal Prepared Spells");
    //  - `max` as a STRING ("4") on 4 Bestiary 2 / Monster Core spontaneous
    //    entries (bone prophet, lunar naga, suli dune dancer, worm that walks
    //    cultist), hence the coercion -- those were silently dropped too;
    //  - no `max` at all on one slot whose every reference is `{ id: null }`
    //    (greater herexen's slot1), hence the default.
    // `value` and each reference's `expended` are upstream PLAY state (slots
    // spent, spells cast) and deliberately not read: the dataset describes a
    // creature at the start of an encounter.
    slots: z
      .record(
        z.object({
          max: z.coerce.number().default(0),
          prepared: z
            .array(z.object({ id: z.string().nullish() }))
            .default([]),
        }),
      )
      .default({}),
    spelldc: z.object({ dc: z.number(), value: z.number() }),
    tradition: z.object({ value: z.string() }),
    autoHeightenLevel: z
      .object({ value: z.number().nullish() })
      .nullish(),
  }),
});

const SpellItemSchema = z.object({
  _id: z.string(),
  name: z.string(),
  type: z.literal("spell"),
  // Where the item was copied from: `_stats.compendiumSource` on all 6835
  // sourced spell items in the five books, the older `flags.core.sourceId`
  // on none of them today -- read as a fallback all the same, since it is
  // the same link under its pre-V12 name.
  _stats: z.object({ compendiumSource: z.string().nullish() }).nullish(),
  flags: z
    .object({ core: z.object({ sourceId: z.string().nullish() }).nullish() })
    .nullish(),
  system: z.object({
    slug: z.string().nullish(),
    level: z.object({ value: z.number() }),
    location: z.object({
      value: z.string().nullish(),
      heightenedLevel: z.number().nullish(),
      uses: z.object({ max: z.number().nullish() }).nullish(),
    }),
    ritual: z.unknown().nullish(),
    time: z.object({ value: z.string() }),
    traits: z.object({ value: z.array(z.string()).default([]) }),
  }),
});

type SpellItem = z.infer<typeof SpellItemSchema>;

export interface SpellcastingSpell {
  /** Stripped by `CreatureSchema.parse`; carried for the French overlay's
   * per-item Babele join, exactly like `NormalizedAttack.foundryId`. */
  foundryId: string;
  /** The raw upstream item, also stripped by `CreatureSchema.parse`:
   * `buildSpellDetails` falls back to it for a spell the compendium does
   * not carry. */
  item: unknown;
  name: string;
  slug: string;
  rank: number;
  cost: string;
  cantrip: boolean;
  frequency: "at-will" | "constant" | null;
  uses: number | null;
  prepared: number;
}

export interface SpellcastingEntry {
  name: string;
  tradition: string;
  preparation: string;
  dc: number;
  attack: number;
  slots: { rank: number; max: number }[];
  focusPoints: number | null;
  spells: SpellcastingSpell[];
}

/** What a spellcasting entry needs from the actor around it, rather than
 * from its own item. */
export interface SpellcastingActor {
  level: number;
  /** `system.resources.focus.max`, absent on 2 of the 56 focus entries'
   * creatures (NPC Core's avuncular professor and gourd leshy witch). */
  focusMax: number | null;
}

/**
 * The innate "(At Will)"/"(Constant)" markers live only in the spell's NAME
 * upstream -- 523 at-will and 234 constant spells, in free-form
 * parentheticals such as "(At Will, Self Only)", "(At will) (Self only)" or
 * "(Constant, Trees Only)", and once hyphenated (NPC Core's fiend caller,
 * "Sending (At-Will)"). Only the parenthetical is searched, so a spell whose
 * own name happened to contain the words could not match; the word
 * boundaries keep "(Self plus Willing Rider)" from matching either.
 */
function frequencyOf(name: string): SpellcastingSpell["frequency"] {
  const open = name.indexOf("(");
  if (open === -1) return null;
  const qualifier = name.slice(open);
  if (/\bat[ -]will\b/i.test(qualifier)) return "at-will";
  if (/constant/i.test(qualifier)) return "constant";
  return null;
}

/** `Compendium.pf2e.spells-srd.Item.<id>` -> `<id>`; `null` for a source in
 * any other pack (or none). */
const SPELLS_SRD_SOURCE = /^Compendium\.pf2e\.spells-srd\.Item\.([A-Za-z0-9]+)$/;

export function compendiumSpellId(source: string | null | undefined): string | null {
  if (source === null || source === undefined) return null;
  return SPELLS_SRD_SOURCE.exec(source)?.[1] ?? null;
}

/** "Dimension Door (At Will)" -> "Dimension Door": everything from the first
 * parenthetical on is a creature-side qualifier (see `frequencyOf`), never
 * part of a spell's own name -- no compendium spell's name contains one. */
export function baseSpellName(name: string): string {
  const open = name.indexOf("(");
  return (open === -1 ? name : name.slice(0, open)).trim();
}

/** Upstream's own `sluggify` for ASCII names: lowercase, apostrophes
 * dropped, every other run of non-alphanumerics a single hyphen. */
export function sluggify(name: string): string {
  return name
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * A spell row's key into `spells/<slug>.json`, from the most authoritative
 * source that has one:
 *  1. the item's own `system.slug` -- set on every non-ritual spell item in
 *     the five books today;
 *  2. the slug of the compendium spell it was copied from, by id;
 *  3. its base name, slugified.
 * The item's own slug outranks its compendium source deliberately: 980 items
 * on legacy creatures point at a compendium id the remaster has since renamed
 * ("dimension-door" items sourced from what is now Translocate), and the
 * legacy row has to keep the legacy spell's key.
 */
function spellSlug(spell: SpellItem, compendiumSlugs: ReadonlyMap<string, string>): string {
  if (spell.system.slug) return spell.system.slug;
  const id = compendiumSpellId(
    spell._stats?.compendiumSource ?? spell.flags?.core?.sourceId,
  );
  const fromCompendium = id === null ? undefined : compendiumSlugs.get(id);
  return fromCompendium ?? sluggify(baseSpellName(spell.name));
}

/**
 * A cantrip -- and a focus spell, under the same PF2 rule ("cantrips and
 * focus spells are automatically heightened to half your level rounded
 * up") -- is always cast at the entry's heightening rank: the entry's own
 * `autoHeightenLevel` when upstream sets it (108 entries), else half the
 * creature's level rounded up, minimum 1. The item's own `level` is its
 * base rank and says nothing about its effective one: left alone, 74 of
 * the 90 non-cantrip focus spells sat at their base rank (Nyrissa's Fey
 * Glamour at 5, not 12).
 */
function cantripRank(entry: z.infer<typeof EntryItemSchema>, actor: SpellcastingActor): number {
  return (
    entry.system.autoHeightenLevel?.value ?? Math.max(1, Math.ceil(actor.level / 2))
  );
}

/**
 * `compendiumSlugs` maps a compendium spell id to its slug, for the rare item
 * with no `system.slug` of its own -- see `spellSlug`. Empty by default: no
 * castable spell item in the five books lacks one today.
 */
export function normalizeSpellcasting(
  items: unknown[],
  actor: SpellcastingActor,
  compendiumSlugs: ReadonlyMap<string, string> = new Map(),
): SpellcastingEntry[] {
  const entries = new Map<
    string,
    { item: z.infer<typeof EntryItemSchema>; out: SpellcastingEntry; spells: SpellItem[] }
  >();

  for (const item of items) {
    const parsed = EntryItemSchema.safeParse(item);
    if (!parsed.success) {
      // See normalizeActions: a wrong-TYPE item is expected and skipped, a
      // `spellcastingEntry` that fails validation is upstream drift and must
      // be loud -- a safeParse + continue here is exactly how every prepared
      // entry went missing without a single report line.
      if (itemHasType(item, "spellcastingEntry")) {
        throw new Error(
          `spellcastingEntry item ${describeItem(item)} failed validation: ${
            parsed.error.issues[0]?.message ?? "invalid"
          } (at ${parsed.error.issues[0]?.path.join(".") ?? "?"})`,
        );
      }
      continue;
    }
    const { _id, name, system } = parsed.data;

    const slots = Object.entries(system.slots)
      .map(([key, slot]) => ({
        rank: Number.parseInt(key.replace("slot", ""), 10),
        max: slot.max,
      }))
      .filter((s) => Number.isFinite(s.rank) && s.max > 0)
      .sort((a, b) => a.rank - b.rank);

    const preparation = system.prepared.value;
    entries.set(_id, {
      item: parsed.data,
      spells: [],
      out: {
        name,
        tradition: system.tradition.value,
        preparation,
        dc: system.spelldc.dc,
        attack: system.spelldc.value,
        slots,
        focusPoints: preparation === "focus" ? actor.focusMax : null,
        spells: [],
      },
    });
  }

  // Parsed item -> the raw one it came from: zod strips every key the schema
  // does not name, and the details fallback needs the whole item.
  const raw = new Map<SpellItem, unknown>();
  for (const item of items) {
    const parsed = SpellItemSchema.safeParse(item);
    if (!parsed.success) {
      if (itemHasType(item, "spell")) {
        throw new Error(
          `spell item ${describeItem(item)} failed validation: ${
            parsed.error.issues[0]?.message ?? "invalid"
          } (at ${parsed.error.issues[0]?.path.join(".") ?? "?"})`,
        );
      }
      continue;
    }
    // Rituals are not cast from a spellcasting entry: upstream gives them a
    // populated `ritual` block, a cast time in days, and a null location.
    // Skipping them explicitly means a null location on a NON-ritual spell
    // stays visible as the broken link it would be.
    const { ritual } = parsed.data.system;
    if (ritual !== null && ritual !== undefined) continue;
    const owner = parsed.data.system.location.value;
    if (owner === null || owner === undefined) continue;
    raw.set(parsed.data, item);
    entries.get(owner)?.spells.push(parsed.data);
  }

  for (const { item: entry, out, spells } of entries.values()) {
    const row = (spell: SpellItem, rank: number, prepared: number): SpellcastingSpell => ({
      foundryId: spell._id,
      item: raw.get(spell),
      name: spell.name,
      slug: spellSlug(spell, compendiumSlugs),
      rank,
      cost: spell.system.time.value,
      cantrip: spell.system.traits.value.includes("cantrip"),
      frequency: frequencyOf(spell.name),
      uses: spell.system.location.uses?.max ?? null,
      prepared,
    });

    if (out.preparation === "prepared") {
      // A prepared caster's spell ITEMS are its repertoire; what it can cast
      // is what its slots reference -- the same item once per rank it is
      // prepared at (56 item/rank pairs are prepared more than once, e.g. two
      // castings of the same rank-1 spell). An item no slot references is not
      // castable and is omitted (12 today, all on Kingmaker's Vordakai).
      // `{ id: null }` is an empty slot position, not a spell.
      const byId = new Map(spells.map((s) => [s._id, s]));
      const counts = new Map<string, { spell: SpellItem; rank: number; prepared: number }>();
      for (const [slotKey, slot] of Object.entries(entry.system.slots)) {
        const slotRank = Number.parseInt(slotKey.replace("slot", ""), 10);
        if (!Number.isFinite(slotRank)) continue;
        const rank = slotRank === 0 ? cantripRank(entry, actor) : slotRank;
        for (const ref of slot.prepared) {
          const spell = ref.id ? byId.get(ref.id) : undefined;
          if (spell === undefined) continue;
          const pair = `${spell._id}\0${rank}`;
          const hit = counts.get(pair);
          if (hit) hit.prepared += 1;
          else counts.set(pair, { spell, rank, prepared: 1 });
        }
      }
      out.spells = [...counts.values()].map((c) => row(c.spell, c.rank, c.prepared));
    } else {
      out.spells = spells.map((spell) =>
        row(
          spell,
          spell.system.traits.value.includes("cantrip") || spell.system.traits.value.includes("focus")
            ? cantripRank(entry, actor)
            : (spell.system.location.heightenedLevel ?? spell.system.level.value),
          0,
        ),
      );
    }

    out.spells.sort((a, b) => b.rank - a.rank || compareStrings(a.name, b.name));
  }

  return [...entries.values()]
    .map((e) => e.out)
    .sort((a, b) => compareStrings(a.name, b.name));
}
