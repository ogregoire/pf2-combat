import { format, useT, type StringKey } from "../i18n/index.js";
import { conditionEffects, type Effect } from "../rules/conditionEffects.js";
import { CONDITIONS, dyingMax, type AppliedCondition, type Attribute, type ConditionSlug, type Expiry } from "../rules/conditions.js";
import { useDescribeExpiry } from "../components/Durations.js";
import { conditionDisplayName, plainParagraphs } from "../rules/traitInfo.js";
import { renderMarkers } from "../rules/renderMarkers.js";
import { useEncounter } from "../state/store.js";
import type { Combatant } from "../state/types.js";
import { useTraitGlossary } from "./useTraitGlossary.js";

const ATTRIBUTE_KEY: Record<Attribute, StringKey> = {
  str: "ATTRIBUTE_STR", dex: "ATTRIBUTE_DEX", con: "ATTRIBUTE_CON", int: "ATTRIBUTE_INT", wis: "ATTRIBUTE_WIS", cha: "ATTRIBUTE_CHA",
};
const SAVE_KEY = { fortitude: "LABEL_FORTITUDE", reflex: "LABEL_REFLEX", will: "LABEL_WILL" } as const;

const signed = (n: number): string => (n >= 0 ? `+${n}` : `−${Math.abs(n)}`);

export interface ConditionTooltipOptions {
  /** The combatant carrying it: drained's Hit Points need its level, dying
   * its doomed. */
  combatant?: Combatant;
  /** Persistent damage's dice. */
  formula?: string;
  /** When it ends on its own. */
  expires?: Expiry;
}

/**
 * The hover text for a condition, wherever it shows: its name, then — when
 * it has a value, or no value to have — exactly what it does with that
 * value, from the same rules the app applies ("AC −2 · Reflex −2"), then
 * its rules text. `value` null is a condition named without one (the
 * picker, a mention in prose with no number): the rules text alone.
 */
export function useConditionTooltip(): (slug: ConditionSlug, value: number | null, options?: ConditionTooltipOptions) => string {
  const t = useT();
  const lang = useEncounter((s) => s.lang);
  const glossary = useTraitGlossary();
  const describeExpiry = useDescribeExpiry();

  const effectLabel = (e: Effect): string => {
    const target = e.target;
    switch (target.kind) {
      case "all": return t("COND_FX_ALL");
      case "ac": return t("LABEL_AC");
      case "saves": return t("COND_FX_SAVES");
      case "save": return t(SAVE_KEY[target.save]);
      case "perception": return t("STATBLOCK_PERCEPTION");
      case "skills": return target.attribute ? format(t("COND_FX_ATTR_SKILLS"), { attribute: t(ATTRIBUTE_KEY[target.attribute]) }) : t("COND_FX_SKILLS");
      case "attacks": return t("COND_FX_ATTACKS");
      case "strikes": return target.attribute ? format(t("COND_FX_ATTR_STRIKES"), { attribute: t(ATTRIBUTE_KEY[target.attribute]) }) : t("COND_FX_STRIKES");
      case "spell": return t("COND_FX_SPELL");
      case "spell-attack": return t("COND_FX_SPELL_ATTACK");
      case "spell-dc": return t("COND_FX_SPELL_DC");
      case "damage": return t("COND_FX_DAMAGE");
    }
  };

  return (slug, value, options = {}) => {
    const def = CONDITIONS[slug];
    const name = conditionDisplayName(slug, glossary, lang);
    const lines: string[] = [def.valued && value !== null ? `${name} ${value}` : name];
    const known = !def.valued || value !== null;
    if (known) {
      const v = value ?? 0;
      const applied: AppliedCondition = { slug, value: v, formula: options.formula };
      const effects = conditionEffects([applied]);
      if (effects.length > 0) lines.push(effects.map((e) => `${effectLabel(e)} ${e.set ? e.value : signed(e.value)}`).join(" · "));
      const plural = (n: number): string => (n === 1 ? "" : "s");
      const level = options.combatant?.level;
      switch (slug) {
        case "frightened": lines.push(t("COND_TIP_FRIGHTENED")); break;
        case "slowed": lines.push(format(t("COND_TIP_SLOWED"), { n: v, plural: plural(v) })); break;
        case "stunned": lines.push(format(t("COND_TIP_STUNNED"), { n: v, plural: plural(v) })); break;
        case "quickened": lines.push(t("COND_TIP_QUICKENED")); break;
        case "stupefied": lines.push(format(t("COND_TIP_STUPEFIED"), { dc: 5 + v })); break;
        case "drained":
          lines.push(level !== undefined
            ? format(t("COND_TIP_DRAINED"), { hp: Math.max(1, level) * v, level: Math.max(1, level), value: v })
            : format(t("COND_TIP_DRAINED_LEVEL"), { value: v }));
          break;
        case "dying": lines.push(format(t("COND_TIP_DIES_AT"), { max: dyingMax(options.combatant?.conditions ?? []) })); break;
        case "doomed": lines.push(format(t("COND_TIP_DIES_AT"), { max: Math.max(0, 4 - v) })); break;
        case "wounded": lines.push(format(t("COND_TIP_WOUNDED"), { value: v })); break;
        case "persistent-damage":
          lines.push(format(t("COND_TIP_PERSISTENT"), { formula: options.formula ?? t("PROMPT_PERSISTENT_DAMAGE_FORMULA_FALLBACK") }));
          break;
        default: break;
      }
      const ends = describeExpiry(options.expires);
      if (ends) lines.push(ends);
      if (def.implies && def.implies.length > 0) {
        lines.push(format(t("COND_TIP_INCLUDES"), { list: def.implies.map((s) => conditionDisplayName(s, glossary, lang)).join(", ") }));
      }
    }
    const description = glossary.get(slug)?.description;
    if (description) lines.push("", plainParagraphs(renderMarkers(description, lang)));
    return lines.join("\n");
  };
}
