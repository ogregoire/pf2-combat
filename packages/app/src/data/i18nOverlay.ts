import type { CreatureI18n } from "@pf2/schema";
import { BASE, getJson, type FetchFn } from "./catalog.js";

const defaultFetch: FetchFn = (url) => fetch(url);

/** A pack's search-index overlay: creature id -> French name only. */
export type IndexI18n = Record<string, string>;

/**
 * A slug's French name (always present) and description (may be `null`
 * when the source entry has no body, e.g. `grab`). Shape shared by
 * conditions.json and glossary.json.
 */
export type ReferenceI18n = Record<string, { name: string; description: string | null }>;

/**
 * A trait's French description (always present -- traits are keyed off
 * `PF2E.TraitDescription*`) and name (`null` when the trait has a French
 * description but no French display name; an English-derived fallback must
 * never be written here). A slug absent from this record has no French
 * translation at all.
 */
export type TraitsI18n = Record<string, { name: string | null; description: string }>;

/**
 * Untranslated creatures have no overlay file at all -- a 404 here is
 * normal, not an error, so this resolves `null` rather than throwing (unlike
 * `getJson`, which every other loader in this module uses).
 */
export async function loadCreatureI18n(
  id: string,
  fetchFn: FetchFn = defaultFetch,
): Promise<CreatureI18n | null> {
  const res = await fetchFn(`${BASE}data/i18n/fr/creatures/${id}.json`);
  if (!res.ok) return null;
  return (await res.json()) as CreatureI18n;
}

export function loadIndexI18n(pack: string, fetchFn: FetchFn = defaultFetch): Promise<IndexI18n> {
  return getJson<IndexI18n>(`i18n/fr/index/${pack}.json`, fetchFn);
}

export function loadConditionsI18n(fetchFn: FetchFn = defaultFetch): Promise<ReferenceI18n> {
  return getJson<ReferenceI18n>("i18n/fr/conditions.json", fetchFn);
}

export function loadGlossaryI18n(fetchFn: FetchFn = defaultFetch): Promise<ReferenceI18n> {
  return getJson<ReferenceI18n>("i18n/fr/glossary.json", fetchFn);
}

export function loadTraitsI18n(fetchFn: FetchFn = defaultFetch): Promise<TraitsI18n> {
  return getJson<TraitsI18n>("i18n/fr/traits.json", fetchFn);
}

/** French if present, English otherwise. The ONLY place this rule lives. */
export function pick<T>(fr: T | null | undefined, en: T): T {
  return fr ?? en;
}
