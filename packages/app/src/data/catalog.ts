import type { BookCatalogEntry, Condition, GlossaryEntry, IndexEntry, Trait } from "@pf2/schema";
import { compareStrings } from "../rules/compare.js";
import { fold, namePart } from "../rules/fold.js";

export type FetchFn = (url: string) => Promise<Response>;

const defaultFetch: FetchFn = (url) => fetch(url);

export const BASE = import.meta.env.BASE_URL ?? "/";

export async function getJson<T>(path: string, fetchFn: FetchFn): Promise<T> {
  const res = await fetchFn(`${BASE}data/${path}`);
  if (!res.ok) throw new Error(`failed to load data/${path}: ${res.status}`);
  return (await res.json()) as T;
}

export function loadBooks(fetchFn: FetchFn = defaultFetch): Promise<BookCatalogEntry[]> {
  return getJson<BookCatalogEntry[]>("books.json", fetchFn);
}

export function loadIndex(pack: string, fetchFn: FetchFn = defaultFetch): Promise<IndexEntry[]> {
  return getJson<IndexEntry[]>(`index/${pack}.json`, fetchFn);
}

/** The monster-ability glossary (Grab, Attack of Opportunity, ...) — one of
 * the two sources `useTraitGlossary` looks trait/keyword hover text up in. */
export function loadGlossary(fetchFn: FetchFn = defaultFetch): Promise<GlossaryEntry[]> {
  return getJson<GlossaryEntry[]>("glossary.json", fetchFn);
}

/** Condition definitions (Blinded, Clumsy, ...) — another source
 * `useTraitGlossary` looks trait/keyword hover text up in. */
export function loadConditionDefs(fetchFn: FetchFn = defaultFetch): Promise<Condition[]> {
  return getJson<Condition[]>("conditions.json", fetchFn);
}

/** Weapon/action trait and keyword reference (Agile, Deadly, Reach, ...) —
 * `useTraitGlossary`'s primary source; `glossary.json` is a monster-ability
 * glossary and has nothing for these. */
export function loadTraits(fetchFn: FetchFn = defaultFetch): Promise<Trait[]> {
  return getJson<Trait[]>("traits.json", fetchFn);
}

/**
 * A slug present in more than one active book resolves in favour of the
 * remaster entry; the legacy one is dropped from search results but remains
 * reachable by id. Which entry wins therefore depends on the books the GM has
 * enabled, which is why this runs here and not in the pipeline.
 */
export function resolveCollisions(entries: IndexEntry[]): IndexEntry[] {
  const bySlug = new Map<string, IndexEntry>();
  for (const e of entries) {
    const held = bySlug.get(e.slug);
    if (held === undefined) {
      bySlug.set(e.slug, e);
      continue;
    }
    if (e.remaster && !held.remaster) bySlug.set(e.slug, e);
    else if (e.remaster === held.remaster && compareStrings(e.id, held.id) < 0) {
      bySlug.set(e.slug, e);
    }
  }
  return [...bySlug.values()].sort((a, b) => compareStrings(a.id, b.id));
}

/**
 * Substring search for the AddCombatants drawer. Both the query and every
 * candidate name are folded (`fold.js`) before comparison, so an unaccented
 * query finds an accented French name. A hit on the name's part before any
 * parenthesised qualifier ranks ahead of a hit confined to the qualifier
 * ("Jann (Génie)") — never `localeCompare`, same reasoning as `rankMatches`.
 */
export function searchCreatures(entries: IndexEntry[], query: string): IndexEntry[] {
  const q = fold(query.trim());
  const byName = (a: IndexEntry, b: IndexEntry): number => compareStrings(a.name, b.name) || compareStrings(a.id, b.id);
  if (q === "") return [...entries].sort(byName);

  const tiered: { entry: IndexEntry; tier: number }[] = [];
  for (const entry of entries) {
    if (fold(namePart(entry.name)).includes(q)) tiered.push({ entry, tier: 1 });
    else if (fold(entry.name).includes(q)) tiered.push({ entry, tier: 2 });
  }

  tiered.sort((a, b) => a.tier - b.tier || byName(a.entry, b.entry));
  return tiered.map((t) => t.entry);
}
