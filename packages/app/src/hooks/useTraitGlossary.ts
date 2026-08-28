import { useEffect, useState } from "react";
import { loadConditionDefs, loadGlossary, loadTraits, type FetchFn } from "../data/catalog.js";
import {
  loadConditionsI18n,
  loadGlossaryI18n,
  loadTraitsI18n,
  pick,
  type ReferenceI18n,
  type TraitsI18n,
} from "../data/i18nOverlay.js";
import { useEncounter } from "../state/store.js";
import type { TraitInfo } from "../rules/traitInfo.js";

/**
 * Loads the trait/keyword reference, the monster-ability glossary and the
 * condition list on mount and merges them into one slug -> { name,
 * description } lookup, for the hover tooltips in the action list (and,
 * when `lang` is "fr", the condition names in RowPopover's picker/chips).
 * `traits.json` (Agile, Deadly, Reach, ...) is the primary source and wins
 * on a slug collision; `glossary.json` and `conditions.json` fill in
 * anything traits.json doesn't cover (e.g. "grab", a monster ability, or
 * "clumsy", a condition — neither of which traits.json has). Starts (and on
 * error, stays) as an empty map rather than surfacing a loading/error state
 * — a trait with no entry yet just renders with no tooltip, which is
 * already the correct behaviour for a trait genuinely absent from every
 * source.
 *
 * When French is on, each entry's `name`/`description` is resolved through
 * `pick` against the matching French overlay, one slug at a time, at the
 * same three-source layering as the English pass — never a blanket "prefer
 * French" swap, since a slug can be French for one field and fall back to
 * English for the other (traits.json: 10 slugs have a French description
 * but no French name; `environment`/`gnoll`/`grippli` have no French entry
 * at all, so both fields fall back). Fetches the three overlay files only
 * when `lang` is "fr" — there would otherwise be nothing to use them for.
 */
export function useTraitGlossary(fetchFn?: FetchFn): Map<string, TraitInfo> {
  const [bySlug, setBySlug] = useState<Map<string, TraitInfo>>(new Map());
  const lang = useEncounter((s) => s.lang);

  useEffect(() => {
    let cancelled = false;

    const overlays: Promise<[TraitsI18n | null, ReferenceI18n | null, ReferenceI18n | null]> =
      lang === "fr"
        ? Promise.all([loadTraitsI18n(fetchFn), loadGlossaryI18n(fetchFn), loadConditionsI18n(fetchFn)])
        : Promise.resolve([null, null, null]);

    Promise.all([Promise.all([loadTraits(fetchFn), loadGlossary(fetchFn), loadConditionDefs(fetchFn)]), overlays])
      .then(([[traits, glossary, conditions], [frTraits, frGlossary, frConditions]]) => {
        if (cancelled) return;
        const map = new Map<string, TraitInfo>();
        for (const g of glossary) {
          const fr = frGlossary?.[g.slug];
          map.set(g.slug, { name: pick(fr?.name, g.name), description: pick(fr?.description, g.description) });
        }
        for (const c of conditions) {
          const fr = frConditions?.[c.slug];
          map.set(c.slug, { name: pick(fr?.name, c.name), description: pick(fr?.description, c.description) });
        }
        for (const t of traits) {
          const fr = frTraits?.[t.slug];
          map.set(t.slug, { name: pick(fr?.name, t.name), description: pick(fr?.description, t.description) });
        }
        setBySlug(map);
      })
      .catch(() => {
        // Leave the map empty — no tooltip is the correct fallback.
      });

    return () => {
      cancelled = true;
    };
  }, [fetchFn, lang]);

  return bySlug;
}
