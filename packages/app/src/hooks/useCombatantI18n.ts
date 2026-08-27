import { useEffect, useState } from "react";
import type { CreatureI18n } from "@pf2/schema";
import { loadCreatureI18n } from "../data/i18nOverlay.js";
import { useEncounter } from "../state/store.js";

// Shared across every call site, keyed by creature id — so combatants of
// the same creature (e.g. `addMany`), and the same combatant re-rendering
// after a `lang` toggle, share one fetch instead of firing one per row.
const cache = new Map<string, Promise<CreatureI18n | null>>();

function cachedFetch(
  creatureId: string,
  fetchFn: (id: string) => Promise<CreatureI18n | null>,
): Promise<CreatureI18n | null> {
  let promise = cache.get(creatureId);
  if (!promise) {
    promise = fetchFn(creatureId).catch(() => null);
    cache.set(creatureId, promise);
  }
  return promise;
}

/**
 * A combatant's French overlay, resolved from its `creatureId` rather than
 * trusted from `combatant.i18n` alone. `combatant.i18n` is authoritative
 * when it is already populated (a caller seeding the store directly, e.g.
 * tests) — but a combatant added through AddCombatants/QuickAdd while
 * `lang` was "en", or one persisted from before overlays existed, carries
 * `i18n: null` forever, with nothing else to re-fetch it. This hook closes
 * that gap: whenever `lang` is "fr" and `combatant.i18n` is still null, it
 * fetches by `creatureId` — cached, so toggling `lang` back and forth, or
 * rendering many combatants of the same creature, never refetches — and
 * the result stands in for `combatant.i18n` until the store itself carries
 * one.
 */
export function useCombatantI18n(
  combatant: { i18n: CreatureI18n | null; creatureId?: string },
  fetchFn: (id: string) => Promise<CreatureI18n | null> = loadCreatureI18n,
): CreatureI18n | null {
  const lang = useEncounter((s) => s.lang);
  const [fetched, setFetched] = useState<CreatureI18n | null>(null);
  const creatureId = combatant.creatureId;
  const needsFetch = combatant.i18n === null && lang === "fr" && creatureId !== undefined;

  useEffect(() => {
    if (!needsFetch || creatureId === undefined) return;
    let cancelled = false;
    cachedFetch(creatureId, fetchFn).then((i18n) => {
      if (!cancelled) setFetched(i18n);
    });
    return () => {
      cancelled = true;
    };
  }, [needsFetch, creatureId, fetchFn]);

  return combatant.i18n ?? fetched;
}
