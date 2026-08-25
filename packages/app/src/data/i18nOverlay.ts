import type { Action, Attack, CreatureI18n } from "@pf2/schema";
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

/**
 * A creature's display name for the given `lang`: French when `i18n` was
 * fetched (its `name` is never null in `CreatureI18n`), English otherwise —
 * whether that's because `i18n` is `null` (no overlay, or added while
 * `lang` was "en") or because `lang` itself is "en". `fallback` is true
 * only in the former case (French is on, but there's no French name to
 * show), so a caller can mark that the name on screen is English.
 */
export function resolveCreatureName(
  name: string,
  i18n: CreatureI18n | null,
  lang: "en" | "fr",
): { name: string; fallback: boolean } {
  if (lang !== "fr") return { name, fallback: false };
  if (i18n) return { name: i18n.name, fallback: false };
  return { name, fallback: true };
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
