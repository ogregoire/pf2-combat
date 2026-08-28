import {
  CreatureSchema,
  BookCatalogEntrySchema,
  IndexEntrySchema,
  ConditionSchema,
  GlossaryEntrySchema,
  TraitSchema,
  type BookCatalogEntry,
  type Condition,
  type GlossaryEntry,
  type CreatureI18n,
  type IndexEntry,
  type Manifest,
  type Trait,
} from "@pf2/schema";
import { buildIndexes } from "./index.js";
import { compareStrings } from "../util.js";

const ALIGNMENT_TRAITS = new Set([
  "lawful",
  "chaotic",
  "good",
  "evil",
  "neutral",
]);

export interface VerifyInput {
  creatures: unknown[];
  books: unknown[];
  indexes: Record<string, unknown[]>;
  conditions: unknown[];
  glossary: unknown[];
  traits: unknown[];
  manifest: Manifest;
}

export interface VerifyResult {
  ok: boolean;
  failures: string[];
}

/** The slice of a creature `verifyI18n` needs: its id and the English names of
 * its sorted actions/attacks, in the order the overlay indexes them. */
export interface I18nSubject {
  id: string;
  actions: { name: string }[];
  attacks: { name: string }[];
}

// `[A-Za-z]*`, not `+`: a bare `@[` has no family name at all and would
// otherwise escape both checks. One real occurrence -- harbormaster's
// `@[[/act balance]]{Garder l'équilibre}`, a stray `@` in front of an
// ordinary enricher. English has zero `@[`.
const MARKER_PATTERN = /@([A-Za-z]*)\[/g;

/** Four of the module's references have lost their `@`-prefix entirely, so
 * they carry no marker family for the check above to see -- they just render
 * as literal `[Compendium.pf2e…]{Label}`. The lookbehind keeps a normal
 * `@UUID[Compendium.pf2e…]` from being reported twice, once per check. Not
 * global: only used with `.test`. */
const BARE_REFERENCE_PATTERN = /(?<![A-Za-z\]])\[(?:Compendium\.\s*)?pf2e[.-]/;

/** The only marker families allowed to survive into emitted text, because the
 * ENGLISH dataset carries them too (2082 `@Check`, 1590 `@Damage`, 681
 * `@Template`) and the app renders them. Everything else must have been
 * resolved away. Exported so a test can assert this agrees with the app's
 * own copy, `RENDERED_MARKER_FAMILIES` in
 * packages/app/src/rules/renderMarkers.ts. */
export const RENDERED_MARKERS = new Set(["Check", "Damage", "Template"]);

/**
 * Babele ships raw Foundry text, so a marker only disappears if the builder
 * ran `resolveLocalize` + `resolveLinks`; this is what proves it did.
 *
 * Deliberately an ALLOW-LIST rather than a list of families to reject. The
 * first version named `@UUID` and `@Localize` by hand and sailed straight past
 * 16 `@Compendium[...]` markers -- the pre-V9 spelling of the same reference.
 * Anything the English dataset does not carry is unresolved by definition.
 */
export function verifyI18nMarkup(label: string, value: unknown): string[] {
  const json = JSON.stringify(value);

  const unresolved = new Set<string>();
  for (const match of json.matchAll(MARKER_PATTERN)) {
    const family = match[1]!;
    if (!RENDERED_MARKERS.has(family)) unresolved.add(family);
  }
  const problems = [...unresolved]
    .sort(compareStrings)
    .map((family) =>
      family === ""
        ? `i18n: ${label} contains an unresolved @[ marker`
        : `i18n: ${label} contains an unresolved @${family} reference`,
    );

  if (BARE_REFERENCE_PATTERN.test(json)) {
    problems.push(`i18n: ${label} contains an unresolved compendium reference`);
  }

  return problems;
}

/**
 * The guard the whole index-keying scheme depends on.
 *
 * A creature's French overlay is aligned to `Creature.actions`/`.attacks` by
 * ARRAY POSITION, because 156 creatures carry two Strikes of the same English
 * name and a name key would collapse them. Position-keying is only safe while
 * the two arrays agree, so every overlay entry carries the English `name` it
 * was built from and this check compares them back, position for position.
 *
 * An upstream reorder, an added item or a dropped one must surface as a loud
 * failure -- the alternative is a Strike quietly showing another Strike's
 * translation, which no schema check would ever catch.
 */
export function verifyI18n(creature: I18nSubject, overlay: CreatureI18n): string[] {
  const problems: string[] = verifyI18nMarkup(creature.id, overlay);

  const check = (
    field: "actions" | "attacks",
    english: { name: string }[],
    french: { en: string }[],
  ): void => {
    if (english.length !== french.length) {
      problems.push(
        `i18n: ${creature.id}: overlay has ${french.length} ${field} but the creature has ${english.length}`,
      );
      return;
    }
    for (const [i, item] of english.entries()) {
      const got = french[i]!.en;
      if (got !== item.name) {
        problems.push(
          `i18n: ${creature.id}: ${field}[${i}] is "${item.name}" but the overlay was built from "${got}"`,
        );
      }
    }
  };

  check("actions", creature.actions, overlay.actions);
  check("attacks", creature.attacks, overlay.attacks);

  return problems;
}

export function verifyDataset(input: VerifyInput): VerifyResult {
  const failures: string[] = [];

  // 1. schema validity -- every emitted file validates against its schema.
  const parsed = [];
  for (const raw of input.creatures) {
    const result = CreatureSchema.safeParse(raw);
    if (!result.success) {
      const id = (raw as { id?: string }).id ?? "<unknown>";
      failures.push(`schema: ${id}: ${result.error.issues[0]?.message ?? "invalid"}`);
      continue;
    }
    parsed.push(result.data);
  }

  const parsedBooks: BookCatalogEntry[] = [];
  for (const raw of input.books) {
    const result = BookCatalogEntrySchema.safeParse(raw);
    if (!result.success) {
      const pack = (raw as { pack?: string }).pack ?? "<unknown>";
      failures.push(`schema: book ${pack}: ${result.error.issues[0]?.message ?? "invalid"}`);
      continue;
    }
    parsedBooks.push(result.data);
  }

  const parsedIndexes: Record<string, IndexEntry[]> = {};
  for (const [pack, entries] of Object.entries(input.indexes)) {
    const good: IndexEntry[] = [];
    for (const raw of entries) {
      const result = IndexEntrySchema.safeParse(raw);
      if (!result.success) {
        const id = (raw as { id?: string }).id ?? "<unknown>";
        failures.push(`schema: index ${pack}/${id}: ${result.error.issues[0]?.message ?? "invalid"}`);
        continue;
      }
      good.push(result.data);
    }
    parsedIndexes[pack] = good;
  }

  const parsedConditions: Condition[] = [];
  for (const raw of input.conditions) {
    const result = ConditionSchema.safeParse(raw);
    if (!result.success) {
      const slug = (raw as { slug?: string }).slug ?? "<unknown>";
      failures.push(`schema: condition ${slug}: ${result.error.issues[0]?.message ?? "invalid"}`);
      continue;
    }
    parsedConditions.push(result.data);
  }

  const parsedGlossary: GlossaryEntry[] = [];
  for (const raw of input.glossary) {
    const result = GlossaryEntrySchema.safeParse(raw);
    if (!result.success) {
      const slug = (raw as { slug?: string }).slug ?? "<unknown>";
      failures.push(`schema: glossary ${slug}: ${result.error.issues[0]?.message ?? "invalid"}`);
      continue;
    }
    parsedGlossary.push(result.data);
  }

  const parsedTraits: Trait[] = [];
  for (const raw of input.traits) {
    const result = TraitSchema.safeParse(raw);
    if (!result.success) {
      const slug = (raw as { slug?: string }).slug ?? "<unknown>";
      failures.push(`schema: trait ${slug}: ${result.error.issues[0]?.message ?? "invalid"}`);
      continue;
    }
    parsedTraits.push(result.data);
  }

  // 2. book counts match index lengths
  for (const book of parsedBooks) {
    const entries = parsedIndexes[book.pack];
    if (entries === undefined) {
      failures.push(`books: ${book.pack} has no index`);
      continue;
    }
    if (entries.length !== book.creatureCount) {
      failures.push(
        `books: ${book.pack} creatureCount ${book.creatureCount} != index length ${entries.length}`,
      );
    }
  }

  // 3. every index entry has a creature
  const ids = new Set(parsed.map((c) => c.id));
  for (const entries of Object.values(parsedIndexes)) {
    for (const entry of entries) {
      if (!ids.has(entry.id)) {
        failures.push(`index: ${entry.id} has no creature record`);
      }
    }
  }

  // 4. collision set matches the manifest
  const actual = JSON.stringify(buildIndexes(parsed).collisions);
  const recorded = JSON.stringify(input.manifest.collisions);
  if (actual !== recorded) {
    failures.push(`collisions: computed set ${actual} != manifest set ${recorded}`);
  }

  // 5. no alignment trait survives
  for (const c of parsed) {
    for (const trait of c.traits) {
      if (ALIGNMENT_TRAITS.has(trait)) {
        failures.push(`alignment: ${c.id} still carries trait "${trait}"`);
      }
    }
  }

  // 6. no unresolved @UUID or @Localize markup remains -- creatures,
  // conditions and glossary entries alike (buildConditions applies
  // resolveLocalize too, see N4).
  for (const c of parsed) {
    const json = JSON.stringify(c);
    if (json.includes("@UUID[")) {
      failures.push(`links: ${c.id} contains an unresolved @UUID reference`);
    }
    if (json.includes("@Localize[")) {
      failures.push(`links: ${c.id} contains an unresolved @Localize reference`);
    }
  }
  for (const c of parsedConditions) {
    const json = JSON.stringify(c);
    if (json.includes("@UUID[")) {
      failures.push(`links: condition ${c.slug} contains an unresolved @UUID reference`);
    }
    if (json.includes("@Localize[")) {
      failures.push(`links: condition ${c.slug} contains an unresolved @Localize reference`);
    }
  }
  for (const c of parsedGlossary) {
    const json = JSON.stringify(c);
    if (json.includes("@UUID[")) {
      failures.push(`links: glossary ${c.slug} contains an unresolved @UUID reference`);
    }
    if (json.includes("@Localize[")) {
      failures.push(`links: glossary ${c.slug} contains an unresolved @Localize reference`);
    }
  }
  for (const c of parsedTraits) {
    const json = JSON.stringify(c);
    if (json.includes("@UUID[")) {
      failures.push(`links: trait ${c.slug} contains an unresolved @UUID reference`);
    }
    if (json.includes("@Localize[")) {
      failures.push(`links: trait ${c.slug} contains an unresolved @Localize reference`);
    }
  }

  // 7. a book's `mixed` flag matches whether its creatures actually share one
  // source (book/license/remaster) -- catches a future regression to the
  // "first creature wins" bug this flag exists to surface.
  const byPack = new Map<string, typeof parsed>();
  for (const c of parsed) {
    const list = byPack.get(c.source.pack) ?? [];
    list.push(c);
    byPack.set(c.source.pack, list);
  }
  for (const book of parsedBooks) {
    const packCreatures = byPack.get(book.pack) ?? [];
    const distinct = new Set(
      packCreatures.map((c) => `${c.source.book}\0${c.source.license}\0${c.source.remaster}`),
    );
    const actuallyMixed = distinct.size > 1;
    if (actuallyMixed !== book.mixed) {
      failures.push(
        `books: ${book.pack} mixed flag is ${book.mixed} but source uniformity says ${actuallyMixed}`,
      );
    }
  }

  return { ok: failures.length === 0, failures };
}
