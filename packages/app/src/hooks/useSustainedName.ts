import { resolveActions } from "../data/i18nOverlay.js";
import type { Combatant, SustainedEffect } from "../state/types.js";
import { useEncounter } from "../state/store.js";
import { useCombatantI18n } from "./useCombatantI18n.js";
import { useTraitGlossary } from "./useTraitGlossary.js";

/** Names a combatant's Sustained effects in the display language: a
 * spell by its row in the French overlay, an ability through the same
 * resolution the action list uses; the English name otherwise. */
export function useSustainedName(combatant: Combatant | undefined): (effect: SustainedEffect) => string {
  const lang = useEncounter((s) => s.lang);
  const glossary = useTraitGlossary();
  const i18n = useCombatantI18n(combatant ?? { i18n: null, creatureId: undefined });
  return (effect) => {
    if (lang !== "fr" || !combatant) return effect.name;
    if (effect.kind === "spell" && effect.flatIndex !== undefined) return i18n?.spells?.[effect.flatIndex]?.name ?? effect.name;
    if (effect.kind === "action" && effect.actionIndex !== undefined) {
      return resolveActions(combatant.actions, i18n, lang, glossary)[effect.actionIndex]?.name ?? effect.name;
    }
    return effect.name;
  };
}

/** Names one of a combatant's abilities, by its position in
 * `Combatant.actions`, in the display language; `fallback` (the English
 * name) when it can't. */
export function useAbilityName(combatant: Combatant | undefined): (index: number, fallback: string) => string {
  const lang = useEncounter((s) => s.lang);
  const glossary = useTraitGlossary();
  const i18n = useCombatantI18n(combatant ?? { i18n: null, creatureId: undefined });
  return (index, fallback) => {
    if (lang !== "fr" || !combatant || index < 0) return fallback;
    return resolveActions(combatant.actions, i18n, lang, glossary)[index]?.name ?? fallback;
  };
}
