import { useState } from "react";
import { format, useT, type StringKey } from "../i18n/index.js";
import { EFFECT_PRESETS, EFFECT_TARGETS, type CustomEffect, type EffectPreset, type EffectTarget } from "../rules/effects.js";
import type { ModifierType } from "../rules/modifiers.js";
import { useEncounter } from "../state/store.js";
import type { Combatant } from "../state/types.js";
import { DurationSelect, useDescribeExpiry } from "./Durations.js";
import { hover } from "./HoverCard.js";
import { activeCombatantOf } from "./TurnPrompts.js";

const PRESET_KEY: Record<string, StringKey> = {
  "lesser-cover": "EFFECT_LESSER_COVER",
  cover: "EFFECT_COVER",
  "greater-cover": "EFFECT_GREATER_COVER",
  "raised-shield": "EFFECT_RAISED_SHIELD",
  bless: "EFFECT_BLESS",
  "courageous-anthem": "EFFECT_COURAGEOUS_ANTHEM",
  heroism: "EFFECT_HEROISM",
};
const TARGET_KEY: Record<EffectTarget, StringKey> = {
  all: "COND_FX_ALL", ac: "LABEL_AC", saves: "COND_FX_SAVES", fortitude: "LABEL_FORTITUDE", reflex: "LABEL_REFLEX",
  will: "LABEL_WILL", perception: "STATBLOCK_PERCEPTION", skills: "COND_FX_SKILLS", attacks: "COND_FX_ATTACKS",
  "spell-dc": "COND_FX_SPELL_DC", damage: "EFFECT_TARGET_DAMAGE",
};
const TYPE_KEY: Record<ModifierType, StringKey> = {
  status: "MOD_TYPE_STATUS", circumstance: "MOD_TYPE_CIRCUMSTANCE", item: "MOD_TYPE_ITEM", untyped: "MOD_TYPE_UNTYPED",
};
const TYPES: ModifierType[] = ["status", "circumstance", "item", "untyped"];

const signed = (n: number): string => (n >= 0 ? `+${n}` : `−${Math.abs(n)}`);

/** An effect's hover text: what it gives, to what, and when it ends. */
function useEffectHover(): (e: CustomEffect) => string {
  const t = useT();
  const describe = useDescribeExpiry();
  return (e) =>
    [
      `${e.label} ${signed(e.value)}`,
      `${e.targets.map((x) => t(TARGET_KEY[x])).join(", ")} ${signed(e.value)} (${t(TYPE_KEY[e.type])})`,
      describe(e.expires),
    ]
      .filter(Boolean)
      .join("\n");
}

/** A combatant's bonuses and penalties as chips — green for a bonus, red
 * for a penalty — each hoverable; on rows and on the stats panel. */
export function EffectChips({ combatant }: { combatant: Combatant }): React.ReactElement | null {
  const effectHover = useEffectHover();
  const effects = combatant.effects ?? [];
  if (effects.length === 0) return null;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "3px", marginTop: "3px" }}>
      {effects.map((e) => (
        <span
          key={e.id}
          data-testid="effect-chip"
          {...hover(effectHover(e))}
          style={{
            cursor: "help",
            fontSize: "10px",
            padding: "1px 6px",
            borderRadius: "2px",
            background: e.value >= 0 ? "var(--ok-bg)" : "var(--danger-bg)",
            color: e.value >= 0 ? "var(--ok)" : "var(--danger)",
            border: `1px solid ${e.value >= 0 ? "var(--ok-border)" : "var(--danger-border)"}`,
          }}
        >
          {e.label} {signed(e.value)}
        </span>
      ))}
    </div>
  );
}

const smallButton: React.CSSProperties = {
  fontFamily: "inherit",
  fontSize: "11px",
  padding: "5px 8px",
  borderRadius: "3px",
  border: "1px solid var(--border-strong)",
  background: "var(--bg)",
  color: "var(--text)",
  cursor: "pointer",
};

/**
 * The popover's bonuses and penalties: what's on, each with its duration
 * and an ×; the common ones in one click — cover, a raised shield (until
 * the start of its bearer's next turn), Bless, Courageous Anthem (until the
 * start of the singer's next turn), Heroism; and any other, typed so PF2's
 * stacking applies.
 */
export function EffectsSection({ combatant }: { combatant: Combatant }): React.ReactElement {
  const t = useT();
  const addEffect = useEncounter((s) => s.addEffect);
  const removeEffect = useEncounter((s) => s.removeEffect);
  const setExpiry = useEncounter((s) => s.setExpiry);
  const encounter = useEncounter((s) => s.encounter);
  const effectHover = useEffectHover();
  const [custom, setCustom] = useState<{ label: string; value: string; type: ModifierType; targets: EffectTarget[] } | null>(null);
  const active = activeCombatantOf(encounter.entries, encounter.activeEntryIndex, encounter.combatants);

  const applyPreset = (p: EffectPreset): void => {
    const anchor = p.ends === "own-next-turn-start" ? combatant.id : active?.id;
    addEffect(combatant.id, {
      label: t(PRESET_KEY[p.key]!),
      value: p.value,
      type: p.type,
      targets: p.targets,
      ...(p.ends && anchor ? { expires: { round: encounter.round + 1, combatantId: anchor, at: "start" as const } } : {}),
    });
  };
  const effects = combatant.effects ?? [];
  const customValue = custom ? Number(custom.value) : NaN;
  const customValid = custom !== null && Number.isInteger(customValue) && customValue !== 0 && custom.targets.length > 0;

  return (
    <div data-testid="effects-section" style={{ borderTop: "1px solid var(--border)", paddingTop: "10px", display: "flex", flexDirection: "column", gap: "8px" }}>
      <div style={{ fontSize: "10px", letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-faint)" }}>{t("EFFECTS_HEADING")}</div>
      {effects.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
          {effects.map((e) => (
            <div
              key={e.id}
              {...hover(effectHover(e))}
              style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap", fontSize: "11.5px", padding: "4px 6px 4px 9px", borderRadius: "3px", background: e.value >= 0 ? "var(--ok-bg)" : "var(--danger-bg)", color: e.value >= 0 ? "var(--ok)" : "var(--danger)" }}
            >
              <span style={{ flexGrow: 1, fontWeight: 600 }}>
                {e.label} {signed(e.value)}
              </span>
              <DurationSelect value={e.expires} label={format(t("DURATION_ARIA"), { name: e.label })} onChange={(x) => setExpiry(combatant.id, { effect: e.id }, x)} />
              <button type="button" aria-label={format(t("REMOVE_NAME_ARIA"), { name: e.label })} onClick={() => removeEffect(combatant.id, e.id)} style={{ ...smallButton, padding: "3px 7px" }}>
                <span aria-hidden="true">×</span>
              </button>
            </div>
          ))}
        </div>
      )}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "5px" }}>
        {EFFECT_PRESETS.map((p) => (
          <button key={p.key} type="button" onClick={() => applyPreset(p)} style={smallButton}>
            {t(PRESET_KEY[p.key]!)} {signed(p.value)}
          </button>
        ))}
        {custom === null && (
          <button type="button" onClick={() => setCustom({ label: "", value: "1", type: "circumstance", targets: [] })} style={{ ...smallButton, borderStyle: "dashed" }}>
            {t("EFFECT_CUSTOM_BUTTON")}
          </button>
        )}
      </div>
      {custom !== null && (
        <div data-testid="custom-effect" style={{ display: "flex", flexDirection: "column", gap: "6px", padding: "8px", borderRadius: "4px", border: "1px dashed var(--border-strong)" }}>
          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
            <input
              aria-label={t("EFFECT_LABEL_ARIA")}
              placeholder={t("EFFECT_LABEL_PLACEHOLDER")}
              value={custom.label}
              onChange={(e) => setCustom({ ...custom, label: e.target.value })}
              style={{ ...smallButton, cursor: "text", flexGrow: 1, minWidth: "90px" }}
            />
            <input
              aria-label={t("EFFECT_VALUE_ARIA")}
              type="number"
              value={custom.value}
              onChange={(e) => setCustom({ ...custom, value: e.target.value })}
              style={{ ...smallButton, cursor: "text", width: "52px" }}
            />
            <select aria-label={t("EFFECT_TYPE_ARIA")} value={custom.type} onChange={(e) => setCustom({ ...custom, type: e.target.value as ModifierType })} style={smallButton}>
              {TYPES.map((x) => (
                <option key={x} value={x}>
                  {t(TYPE_KEY[x])}
                </option>
              ))}
            </select>
          </div>
          <div role="group" aria-label={t("EFFECT_TARGETS_ARIA")} style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
            {EFFECT_TARGETS.map((x) => {
              const on = custom.targets.includes(x);
              return (
                <button
                  key={x}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setCustom({ ...custom, targets: on ? custom.targets.filter((y) => y !== x) : [...custom.targets, x] })}
                  style={{ ...smallButton, fontSize: "10.5px", padding: "3px 7px", background: on ? "var(--select)" : "var(--bg)", color: on ? "var(--select-text)" : "var(--text)" }}
                >
                  {t(TARGET_KEY[x])}
                </button>
              );
            })}
          </div>
          <div style={{ display: "flex", gap: "6px", justifyContent: "flex-end" }}>
            <button type="button" onClick={() => setCustom(null)} style={smallButton}>
              {t("LABEL_CANCEL")}
            </button>
            <button
              type="button"
              disabled={!customValid}
              onClick={() => {
                addEffect(combatant.id, {
                  label: custom.label.trim() || t("EFFECT_CUSTOM_DEFAULT_LABEL"),
                  value: customValue,
                  type: custom.type,
                  targets: custom.targets,
                });
                setCustom(null);
              }}
              style={{ ...smallButton, background: customValid ? "var(--select)" : "var(--panel)", color: customValid ? "var(--select-text)" : "var(--text-faint)", cursor: customValid ? "pointer" : "default" }}
            >
              {t("EFFECT_ADD_BUTTON")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
