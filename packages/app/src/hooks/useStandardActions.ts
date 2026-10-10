import { useEffect, useState } from "react";
import type { Action, StandardAction } from "@pf2/schema";
import { loadStandardActions, type FetchFn } from "../data/catalog.js";
import { loadActionsI18n, pick, type ReferenceI18n } from "../data/i18nOverlay.js";
import { compareLocalized } from "../rules/compare.js";
import { useEncounter } from "../state/store.js";

export interface StandardActionItem {
  /** The upstream slug — the only stable key: French names collide
   * ("Voler" is both Fly and Steal). */
  slug: string;
  action: Action;
}

export interface StandardActionGroups {
  basic: StandardActionItem[];
  skill: StandardActionItem[];
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
        const byName = (a: StandardActionItem, b: StandardActionItem): number =>
          compareLocalized(a.action.name, b.action.name, lang);
        const items = (category: StandardAction["category"]): StandardActionItem[] =>
          actions
            .filter((a) => a.category === category)
            .map((a) => ({ slug: a.slug, action: toAction(a, fr) }))
            .sort(byName);
        setGroups({ basic: items("basic"), skill: items("skill") });
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
