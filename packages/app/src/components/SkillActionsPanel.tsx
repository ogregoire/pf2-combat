import type { FetchFn } from "../data/catalog.js";
import { useCreatureRecord } from "../hooks/useCreatureRecord.js";
import { useStandardActions } from "../hooks/useStandardActions.js";
import { useVocabulary } from "../hooks/useVocabulary.js";
import { useT, type StringKey } from "../i18n/index.js";
import { degreeFaces, DEGREES } from "../rules/saves.js";
import { defenseDc, SKILL_ACTIONS, skillModifier, type Defense } from "../rules/skillActions.js";
import type { Degree } from "../rules/degrees.js";
import type { Combatant } from "../state/types.js";
import { hover, modifiersHover } from "./HoverCard.js";

const DEFENSE_KEY: Record<Defense, StringKey> = {
  fortitude: "LABEL_FORTITUDE", reflex: "LABEL_REFLEX", will: "LABEL_WILL", perception: "STATBLOCK_PERCEPTION",
};
const DEGREE_SHORT_KEY: Record<Degree, StringKey> = {
  "critical-success": "SAVE_CRIT_SUCCESS_SHORT", success: "SAVE_SUCCESS_SHORT", failure: "SAVE_FAILURE_SHORT", "critical-failure": "SAVE_CRIT_FAILURE_SHORT",
};
const DEGREE_KEY: Record<Degree, StringKey> = {
  "critical-success": "SAVE_CRIT_SUCCESS", success: "SAVE_SUCCESS", failure: "SAVE_FAILURE", "critical-failure": "SAVE_CRIT_FAILURE",
};
const signed = (n: number): string => (n >= 0 ? `+${n}` : `−${Math.abs(n)}`);

/**
 * The skill actions that roll against the target's defences — Demoralize
 * against its Will DC, Trip against its Reflex DC, Grapple against its
 * Fortitude DC, Feint against its Perception DC… — each with the target's
 * DC as it stands and, for a creature attacker, its skill modifier (the
 * multiple attack penalty included for an attack) and the chance of each
 * degree. A PC attacker's skills aren't known to the app: the DCs alone.
 */
export function SkillActionsPanel({ combatant, target, fetchFn }: { combatant: Combatant; target: Combatant; fetchFn?: FetchFn }): React.ReactElement | null {
  const t = useT();
  const { basic, skill } = useStandardActions(fetchFn);
  const vocab = useVocabulary(fetchFn);
  const record = useCreatureRecord(combatant.kind === "creature" ? combatant.creatureId : undefined, fetchFn);
  const names = new Map([...basic, ...skill].map((i) => [i.slug, i.action.name]));

  const rows = SKILL_ACTIONS.map((a) => {
    const dc = defenseDc(target, a.defense);
    const roll = skillModifier(record, combatant, a.skill, a.attack);
    return { ...a, dc, roll };
  }).filter((r) => r.dc !== null);
  if (rows.length === 0) return null;

  return (
    <div data-testid="skill-actions-panel" style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
      <div style={{ fontSize: "10px", letterSpacing: "0.09em", textTransform: "uppercase", color: "var(--text-faint)" }}>{t("SKILL_ACTIONS_HEADING")}</div>
      {rows.map((r) => {
        const faces = r.roll ? degreeFaces(r.roll.mod, r.dc!.dc) : null;
        const skillName = vocab.name("skills", r.skill);
        const defense = `${t(DEFENSE_KEY[r.defense])} ${t("SAVE_DC_LABEL")} ${r.dc!.dc}`;
        return (
          <div key={r.slug} data-testid="skill-action-row" style={{ padding: "6px 9px", borderRadius: "4px", border: "1px solid var(--border)", background: "var(--panel-raised)", fontSize: "12px" }}>
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: "2px 8px" }}>
              <span style={{ fontWeight: 600 }}>{names.get(r.slug) ?? r.slug}</span>
              {r.roll && (
                <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-dim)" }} {...hover(modifiersHover(`${skillName} ${signed(r.roll.mod)}`, r.roll.mods))}>
                  {skillName} {signed(r.roll.mod)}
                </span>
              )}
              <span style={{ color: "var(--text-dim)" }} {...hover(modifiersHover(defense, r.dc!.mods))}>
                {t("SKILL_VS")} {defense}
              </span>
            </div>
            {faces && (
              <div style={{ marginTop: "2px", fontSize: "11px", color: "var(--text-dim)" }}>
                {DEGREES.map((d) => (
                  <span key={d} {...hover(t(DEGREE_KEY[d]))} style={{ marginRight: "8px", whiteSpace: "nowrap" }}>
                    <span style={{ fontWeight: 600, color: d === "critical-success" || d === "success" ? "var(--ok)" : "var(--danger)" }}>{t(DEGREE_SHORT_KEY[d])}</span> {faces[d] * 5}%
                  </span>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
