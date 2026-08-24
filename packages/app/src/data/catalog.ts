import type { BookCatalogEntry, IndexEntry } from "@pf2/schema";
import { compareStrings } from "../rules/compare.js";

export type FetchFn = (url: string) => Promise<Response>;

const defaultFetch: FetchFn = (url) => fetch(url);

const BASE = import.meta.env.BASE_URL ?? "/";

async function getJson<T>(path: string, fetchFn: FetchFn): Promise<T> {
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

export function searchCreatures(entries: IndexEntry[], query: string): IndexEntry[] {
  const q = query.trim().toLowerCase();
  const hits = q === "" ? [...entries] : entries.filter((e) => e.name.toLowerCase().includes(q));
  return hits.sort((a, b) => compareStrings(a.name, b.name) || compareStrings(a.id, b.id));
}
