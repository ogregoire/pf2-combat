import { annotateConditions } from "../rules/annotateConditions.js";
import { renderMarkers } from "../rules/renderMarkers.js";
import { conditionDisplayName } from "../rules/traitInfo.js";
import { useEncounter } from "../state/store.js";
import { useConditionTooltip } from "./useConditionTooltip.js";
import { useTraitGlossary } from "./useTraitGlossary.js";

/** Rules text (an ability, a spell, a reaction) ready to render: its
 * markers in plain words, and every condition it names hoverable for its
 * rules and, with a value, what that value does. */
export function useRulesHtml(): (html: string) => string {
  const lang = useEncounter((s) => s.lang);
  const glossary = useTraitGlossary();
  const tooltip = useConditionTooltip();
  return (html) =>
    annotateConditions(renderMarkers(html, lang), lang, (slug) => conditionDisplayName(slug, glossary, lang), (slug, value) => tooltip(slug, value));
}
