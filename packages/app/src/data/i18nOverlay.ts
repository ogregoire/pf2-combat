import type { Action, Attack, CreatureI18n, IndexEntry } from "@pf2/schema";
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

/**
 * Fetches and merges the index overlay for every pack referenced by
 * `entries` (the segment of each id before its first "/"), so a catalog
 * merged across multiple books — as AddCombatants/QuickAdd receive it — ends
 * up with one `id -> French name` record covering all of them. A pack whose
 * overlay fails to load (e.g. none exists) contributes nothing rather than
 * failing the whole merge, the same "untranslated is normal" stance as
 * `loadCreatureI18n`.
 */
export async function loadMergedIndexI18n(
  entries: IndexEntry[],
  loadIndexI18nFn: (pack: string) => Promise<IndexI18n> = loadIndexI18n,
): Promise<IndexI18n> {
  const packs = [...new Set(entries.map((e) => e.id.split("/")[0]!))];
  const maps = await Promise.all(packs.map((pack) => loadIndexI18nFn(pack).catch(() => ({}) as IndexI18n)));
  return Object.assign({}, ...maps);
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

/**
 * A creature's display name for the given `lang`: French when `i18n` was
 * fetched (its `name` is never null in `CreatureI18n`), English otherwise —
 * whether that's because `i18n` is `null` (no overlay, or added while
 * `lang` was "en") or because `lang` itself is "en". No fallback marker:
 * the overlay can't tell "nobody translated this" from "the French name is
 * identical to the English" (Manticore, Ankou, Belker genuinely ARE the
 * French names), so an untranslated creature just renders in English,
 * unannotated, same as it would if it genuinely had no French name.
 */
export function resolveCreatureName(name: string, i18n: CreatureI18n | null, lang: "en" | "fr"): string {
  if (lang !== "fr") return name;
  return pick(i18n?.name, name);
}

/**
 * `actions`/`attacks` with their `name`/`description` resolved to French by
 * array position against `i18n.actions`/`i18n.attacks` (Task 6's alignment
 * guarantee) — never by name, since two Strikes can share one. A no-op
 * outside French or without an overlay, so callers can pass the result
 * straight to the pure layout code in `rules/actionLayout.js` unconditionally.
 */
export function resolveActions(actions: Action[], i18n: CreatureI18n | null, lang: "en" | "fr"): Action[] {
  if (lang !== "fr" || !i18n) return actions;
  return actions.map((action, index) => {
    const fr = i18n.actions[index];
    if (!fr) return action;
    return { ...action, name: pick(fr.name, action.name), description: pick(fr.description, action.description) };
  });
}

export function resolveAttacks(attacks: Attack[], i18n: CreatureI18n | null, lang: "en" | "fr"): Attack[] {
  if (lang !== "fr" || !i18n) return attacks;
  return attacks.map((attack, index) => {
    const fr = i18n.attacks[index];
    if (!fr) return attack;
    return { ...attack, name: pick(fr.name, attack.name) };
  });
}

/**
 * Applies a merged pack index overlay (`IndexI18n`, id -> French name) onto
 * a list of catalog entries: the French name when `lang` is "fr" and the
 * overlay has one for that id, the original name otherwise — the same rule
 * as `resolveCreatureName`. Used to localise AddCombatants/QuickAdd's
 * catalog before it reaches `rankMatches`/`searchCreatures`, so the GM
 * searches — and sees — whichever language they're reading from.
 */
export function localizeEntries(entries: IndexEntry[], indexI18n: IndexI18n, lang: "en" | "fr"): IndexEntry[] {
  if (lang !== "fr") return entries;
  return entries.map((entry) => {
    const fr = indexI18n[entry.id];
    return fr === undefined ? entry : { ...entry, name: fr };
  });
}
