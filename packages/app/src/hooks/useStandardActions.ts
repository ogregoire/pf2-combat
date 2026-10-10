import { useEffect, useState } from "react";
import type { Action, StandardAction } from "@pf2/schema";
import { loadStandardActions, type FetchFn } from "../data/catalog.js";
import { loadActionsI18n, pick, type ReferenceI18n } from "../data/i18nOverlay.js";
import { compareLocalized } from "../rules/compare.js";
import { useEncounter } from "../state/store.js";

export interface StandardActionGroups {
  basic: Action[];
  skill: Action[];
}

/** A standard action in the shape ActionCard renders. */
function toAction(a: StandardAction, fr: ReferenceI18n | null): Action {
  const tr = fr?.[a.slug];
  return {
    name: pick(tr?.name, a.name),
    cost: a.cost,
    category: null,
    traits: a.traits,
    trigger: null,
    requirements: null,
    frequency: null,
    description: pick(tr?.description, a.description),
  };
}

/**
 * The standard actions (actions.json), split into basic and skill actions
 * and resolved to French — name and rules text, slug by slug through
 * `pick` — when `lang` is "fr". Loaded once per language; starts (and on
 * error, stays) empty, so the list simply doesn't render rather than
 * showing a loading state.
 */
export function useStandardActions(fetchFn?: FetchFn): StandardActionGroups {
  const lang = useEncounter((s) => s.lang);
  const [groups, setGroups] = useState<StandardActionGroups>({ basic: [], skill: [] });

  useEffect(() => {
    let cancelled = false;
    Promise.all([loadStandardActions(fetchFn), lang === "fr" ? loadActionsI18n(fetchFn) : Promise.resolve(null)])
      .then(([actions, fr]) => {
        if (cancelled) return;
        const byName = (a: Action, b: Action): number => compareLocalized(a.name, b.name, lang);
        setGroups({
          basic: actions.filter((a) => a.category === "basic").map((a) => toAction(a, fr)).sort(byName),
          skill: actions.filter((a) => a.category === "skill").map((a) => toAction(a, fr)).sort(byName),
        });
      })
      .catch(() => {
        if (!cancelled) setGroups({ basic: [], skill: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [lang, fetchFn]);

  return groups;
}
