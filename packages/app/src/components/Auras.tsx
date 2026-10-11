import { resolveActions } from "../data/i18nOverlay.js";
import { useCombatantI18n } from "../hooks/useCombatantI18n.js";
import { useRulesHtml } from "../hooks/useRulesHtml.js";
import { useTraitGlossary } from "../hooks/useTraitGlossary.js";
import { auraRadius, auras } from "../rules/recallKnowledge.js";
import { formatDistance } from "../rules/distance.js";
import { plainParagraphs } from "../rules/traitInfo.js";
import { useEncounter } from "../state/store.js";
import type { Combatant } from "../state/types.js";
import { hover } from "./HoverCard.js";

export interface AuraView {
  name: string;
  /** "90 feet" / "27 m", when its text gives a radius. */
  radius: string | null;
  hover: string;
}

/** A combatant's auras in the display language: name, radius, and its
 * rules text for the hover card. */
export function useAuras(combatant: Combatant): AuraView[] {
  const lang = useEncounter((s) => s.lang);
  const glossary = useTraitGlossary();
  const i18n = useCombatantI18n(combatant);
  const rulesHtml = useRulesHtml();
  const resolved = resolveActions(combatant.actions, i18n, lang, glossary);
  return auras(combatant.actions).map((a) => {
    const shown = resolved[combatant.actions.indexOf(a)] ?? a;
    const feet = auraRadius(a.description);
    const radius = feet === null ? null : formatDistance(feet, lang);
    return { name: shown.name, radius, hover: `${shown.name}${radius ? ` (${radius})` : ""}\n\n${plainParagraphs(rulesHtml(shown.description))}` };
  });
}

/** Auras on an initiative row: a reminder that standing near it does
 * something, with the rules on hover. */
export function AuraChips({ combatant }: { combatant: Combatant }): React.ReactElement | null {
  const list = useAuras(combatant);
  if (list.length === 0) return null;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "3px", marginTop: "3px" }}>
      {list.map((a) => (
        <span
          key={a.name}
          data-testid="aura-chip"
          {...hover(a.hover)}
          style={{ cursor: "help", fontSize: "10px", padding: "1px 6px", borderRadius: "999px", border: "1px dashed var(--info-border)", color: "var(--info)", whiteSpace: "nowrap" }}
        >
          ◎ {a.name}
          {a.radius ? ` ${a.radius}` : ""}
        </span>
      ))}
    </div>
  );
}
