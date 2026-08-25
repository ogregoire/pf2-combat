import { useEffect, useState } from "react";
import { loadConditionDefs, loadGlossary, type FetchFn } from "../data/catalog.js";
import type { TraitInfo } from "../rules/traitInfo.js";

/**
 * Loads the monster-ability glossary and the condition list on mount and
 * merges them into one slug -> { name, description } lookup, for the
 * trait/keyword hover tooltips in the action list. Starts (and on error,
 * stays) as an empty map rather than surfacing a loading/error state — a
 * trait with no entry yet just renders with no tooltip, which is already
 * the correct behaviour for a trait genuinely absent from either source.
 */
export function useTraitGlossary(fetchFn?: FetchFn): Map<string, TraitInfo> {
  const [bySlug, setBySlug] = useState<Map<string, TraitInfo>>(new Map());

  useEffect(() => {
    let cancelled = false;

    Promise.all([loadGlossary(fetchFn), loadConditionDefs(fetchFn)])
      .then(([glossary, conditions]) => {
        if (cancelled) return;
        const map = new Map<string, TraitInfo>();
        for (const g of glossary) map.set(g.slug, { name: g.name, description: g.description });
        for (const c of conditions) map.set(c.slug, { name: c.name, description: c.description });
        setBySlug(map);
      })
      .catch(() => {
        // Leave the map empty — no tooltip is the correct fallback.
      });

    return () => {
      cancelled = true;
    };
  }, [fetchFn]);

  return bySlug;
}
