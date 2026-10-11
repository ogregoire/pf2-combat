import { useEffect, useState } from "react";
import type { SpellDetail, SpellI18n } from "@pf2/schema";
import { getJson, type FetchFn } from "../data/catalog.js";
import { useEncounter } from "../state/store.js";

const defaultFetch: FetchFn = (url) => fetch(url);

export interface LoadedSpell {
  detail: SpellDetail;
  /** The French overlay, when French is on and the spell has one. */
  fr: SpellI18n | null;
}

// One fetch per spell (and per French overlay) for the session, shared by
// every row that shows it. A failed fetch is evicted so it can retry.
const cache = new Map<string, Promise<unknown>>();

function cached<T>(path: string, fetchFn: FetchFn): Promise<T> {
  let p = cache.get(path) as Promise<T> | undefined;
  if (!p) {
    p = getJson<T>(path, fetchFn).catch((error: unknown) => {
      cache.delete(path);
      throw error;
    });
    cache.set(path, p);
  }
  return p;
}

/** A spell's details, through the same cache the rows read. */
export function loadSpellDetail(slug: string, fetchFn: FetchFn = defaultFetch): Promise<SpellDetail> {
  return cached<SpellDetail>(`spells/${slug}.json`, fetchFn);
}

/** Test-only: forget every cached spell. */
export function __resetSpellDetailCacheForTests(): void {
  cache.clear();
}

/**
 * A spell's full details (data/spells/<slug>.json), fetched only once the
 * GM unfolds it — `enabled` — so a caster's list costs nothing until then.
 * A spell with no French overlay (the file is omitted) resolves `fr` to
 * null and renders in English. `"error"` when the details themselves fail.
 */
export function useSpellDetail(
  slug: string,
  enabled: boolean,
  fetchFn: FetchFn = defaultFetch,
): LoadedSpell | "loading" | "error" {
  const lang = useEncounter((s) => s.lang);
  const [state, setState] = useState<LoadedSpell | "loading" | "error">("loading");

  useEffect(() => {
    if (!enabled) return;
    // A row from an older save may still lack its slug until the creature
    // record refreshes it — never ask for `spells/undefined.json`.
    if (!slug) {
      setState("error");
      return;
    }
    let cancelled = false;
    setState("loading");
    Promise.all([
      cached<SpellDetail>(`spells/${slug}.json`, fetchFn),
      lang === "fr" ? cached<SpellI18n>(`i18n/fr/spells/${slug}.json`, fetchFn).catch(() => null) : Promise.resolve(null),
    ])
      .then(([detail, fr]) => {
        if (!cancelled) setState({ detail, fr });
      })
      .catch(() => {
        if (!cancelled) setState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [slug, enabled, lang, fetchFn]);

  return state;
}
