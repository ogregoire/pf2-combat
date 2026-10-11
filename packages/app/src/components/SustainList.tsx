import { useState } from "react";
import { resolveActions } from "../data/i18nOverlay.js";
import type { FetchFn } from "../data/catalog.js";
import { useCombatantI18n } from "../hooks/useCombatantI18n.js";
import { useSustainedName } from "../hooks/useSustainedName.js";
import { useTraitGlossary } from "../hooks/useTraitGlossary.js";
import { format, useT } from "../i18n/index.js";
import { renderMarkers } from "../rules/renderMarkers.js";
import { useEncounter } from "../state/store.js";
import type { Combatant, SustainedEffect } from "../state/types.js";
import { castButtonStyle, SpellDetails } from "./SpellList.js";
import { remainingActionsFor } from "./TurnManager.js";

/**
 * What the active combatant is concentrating on, each effect with what
 * causes it: the spell or ability, unfolding to its full text. The Sustain
 * button spends the action that keeps it going to the end of the next
 * turn; until it's pressed this turn, the card says the effect ends with
 * the turn — and the end-of-turn dialog reports it if it does.
 */
export function SustainList({ combatant, fetchFn }: { combatant: Combatant; fetchFn?: FetchFn }): React.ReactElement | null {
  const t = useT();
  const nameOf = useSustainedName(combatant);
  const effects = combatant.sustaining ?? [];
  if (effects.length === 0) return null;
  return (
    <div data-testid="sustain-list">
      <div style={{ fontSize: "11px", letterSpacing: "0.09em", textTransform: "uppercase", color: "var(--text-faint)", marginBottom: "6px" }}>
        {t("SUSTAINING_HEADING")}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        {effects.map((e) => (
          <SustainCard key={e.id} combatant={combatant} effect={e} name={nameOf(e)} fetchFn={fetchFn} />
        ))}
      </div>
    </div>
  );
}

function SustainCard({
  combatant,
  effect,
  name,
  fetchFn,
}: {
  combatant: Combatant;
  effect: SustainedEffect;
  name: string;
  fetchFn?: FetchFn;
}): React.ReactElement {
  const t = useT();
  const lang = useEncounter((s) => s.lang);
  const sustainEffect = useEncounter((s) => s.sustainEffect);
  const stopSustaining = useEncounter((s) => s.stopSustaining);
  const glossary = useTraitGlossary(fetchFn);
  const i18n = useCombatantI18n(combatant);
  const [open, setOpen] = useState(false);
  const disabled = effect.sustainedThisTurn || remainingActionsFor(combatant) < 1;
  const action = effect.kind === "action" && effect.actionIndex !== undefined
    ? resolveActions(combatant.actions, i18n, lang, glossary)[effect.actionIndex]
    : undefined;

  return (
    <div
      data-testid="sustain-card"
      style={{ padding: "8px 12px", borderRadius: "4px", background: "var(--info-bg)", border: "1px solid var(--info-border)" }}
    >
      <div
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen((o) => !o);
          }
        }}
        style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer" }}
      >
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true" style={{ transform: open ? "rotate(90deg)" : "none", flexShrink: 0, color: "var(--text-faint)" }}>
          <path d="M3 1.5 7 5 3 8.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <div style={{ flexGrow: 1, minWidth: 0, display: "flex", alignItems: "baseline", flexWrap: "wrap", gap: "2px 8px" }}>
          <span style={{ fontWeight: 600 }}>{name}</span>
          <span style={{ fontSize: "10.5px", letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--info)" }}>
            {t(effect.kind === "spell" ? "SUSTAIN_KIND_SPELL" : "SUSTAIN_KIND_ABILITY")}
          </span>
          <span style={{ fontSize: "11.5px", color: effect.sustainedThisTurn ? "var(--ok)" : "var(--danger)" }}>
            {t(effect.sustainedThisTurn ? "SUSTAINED_THIS_TURN" : "SUSTAIN_OR_IT_ENDS")}
          </span>
        </div>
        <div onClick={(e) => e.stopPropagation()} style={{ display: "flex", gap: "4px", flexShrink: 0 }}>
          <button
            type="button"
            aria-label={format(t("SUSTAIN_ARIA"), { name })}
            title={format(t("SUSTAIN_ARIA"), { name })}
            disabled={disabled}
            onClick={() => sustainEffect(combatant.id, effect.id)}
            style={castButtonStyle(disabled)}
          >
            {t("SUSTAIN_BUTTON")}
          </button>
          <button
            type="button"
            aria-label={format(t("STOP_SUSTAINING_ARIA"), { name })}
            title={format(t("STOP_SUSTAINING_ARIA"), { name })}
            onClick={() => stopSustaining(combatant.id, effect.id)}
            style={{ ...castButtonStyle(true), opacity: 1, cursor: "pointer", color: "var(--text-dim)", padding: "4px 7px" }}
          >
            ×
          </button>
        </div>
      </div>
      {open && effect.kind === "spell" && effect.slug && <SpellDetails slug={effect.slug} glossary={glossary} fetchFn={fetchFn} />}
      {open && action && (
        <div
          style={{ marginTop: "8px", fontSize: "12.5px", lineHeight: 1.5, color: "var(--text-dim)" }}
          dangerouslySetInnerHTML={{ __html: renderMarkers(action.description, lang) }}
        />
      )}
    </div>
  );
}
