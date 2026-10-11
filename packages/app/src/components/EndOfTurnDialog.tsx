import { useEffect, useRef } from "react";
import { format, formatParts, useT } from "../i18n/index.js";
import { useConditionTooltip } from "../hooks/useConditionTooltip.js";
import { useAbilityName, useSustainedName } from "../hooks/useSustainedName.js";
import { useTraitGlossary } from "../hooks/useTraitGlossary.js";
import { conditionDisplayName } from "../rules/traitInfo.js";
import { useEncounter } from "../state/store.js";
import type { EndOfTurnEvent } from "../state/types.js";
import { hover } from "./HoverCard.js";

/**
 * What conditions did as a turn ended — frightened going down, persistent
 * damage rolled and dealt, an effect not Sustained ending — in a dialog the GM closes with OK, so nothing
 * the app changed on its own goes by unseen. The store opens it (Next,
 * Delay) only when something happened.
 */
function SustainEndedLine({ event }: { event: Extract<EndOfTurnEvent, { kind: "sustain-ended" }> }): React.ReactElement {
  const t = useT();
  const combatant = useEncounter((s) => s.encounter.combatants[event.combatantId]);
  const nameOf = useSustainedName(combatant);
  return <>{format(t("END_OF_TURN_SUSTAIN_ENDED"), { name: event.name, effect: nameOf(event.effect) })}</>;
}

function RechargedLine({ event }: { event: Extract<EndOfTurnEvent, { kind: "recharged" }> }): React.ReactElement {
  const t = useT();
  const combatant = useEncounter((s) => s.encounter.combatants[event.combatantId]);
  const abilityName = useAbilityName(combatant);
  return <>{format(t("TURN_START_RECHARGED"), { name: event.name, ability: abilityName(event.actionIndex, event.ability) })}</>;
}

export function EndOfTurnDialog(): React.ReactElement | null {
  const t = useT();
  const lang = useEncounter((s) => s.lang);
  const report = useEncounter((s) => s.endOfTurnReport);
  const dismissEndOfTurnReport = useEncounter((s) => s.dismissEndOfTurnReport);
  const glossary = useTraitGlossary();
  const conditionTooltip = useConditionTooltip();
  const ok = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (report) ok.current?.focus();
  }, [report]);

  if (!report) return null;

  const line = (e: EndOfTurnEvent): React.ReactNode => {
    if (e.kind === "decreased") {
      const condition = (
        <span key="condition" {...hover(conditionTooltip(e.slug, e.to === 0 ? null : e.to))} style={{ textDecoration: "underline dotted", textUnderlineOffset: "2px", cursor: "help" }}>
          {conditionDisplayName(e.slug, glossary, lang)}
        </span>
      );
      return e.to === 0
        ? formatParts(t("END_OF_TURN_CONDITION_ENDS"), { name: e.name, condition })
        : formatParts(t("END_OF_TURN_CONDITION_DECREASES"), { name: e.name, condition, from: String(e.from), to: String(e.to) });
    }
    if (e.kind === "sustain-ended") return <SustainEndedLine event={e} />;
    if (e.kind === "recharged") return <RechargedLine event={e} />;
    return (
      <>
        <span>{format(t("END_OF_TURN_PERSISTENT_DAMAGE"), { name: e.name, rolled: e.rolled, formula: e.formula })}</span>
        {e.hp && (
          <span style={{ color: "var(--danger)", fontFamily: "var(--font-mono)", fontSize: "12px" }}>
            {format(t("END_OF_TURN_HP"), { before: e.hp.before, after: e.hp.after })}
            {e.down && ` · ${t("END_OF_TURN_DOWN")}`}
          </span>
        )}
        <span style={{ fontSize: "12px", color: "var(--text-dim)" }}>{t("END_OF_TURN_FLAT_CHECK")}</span>
      </>
    );
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "var(--scrim)",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        padding: "16px",
        zIndex: 70,
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="end-of-turn-title"
        onKeyDown={(e) => {
          if (e.key === "Escape") dismissEndOfTurnReport();
        }}
        style={{
          width: "min(440px, 100%)",
          background: "var(--panel-raised)",
          border: "1px solid var(--border-strong)",
          borderRadius: "8px",
          boxShadow: "0 16px 48px var(--shadow)",
          padding: "18px 20px",
          display: "flex",
          flexDirection: "column",
          gap: "12px",
        }}
      >
        <h2 id="end-of-turn-title" style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: "19px" }}>
          {t("END_OF_TURN_TITLE")}
        </h2>
        <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: "8px" }}>
          {report.map((e, i) => (
            <li
              key={i}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "3px",
                padding: "8px 11px",
                borderRadius: "4px",
                background: "var(--cond-bg)",
                borderLeft: "3px solid var(--cond)",
                fontSize: "13.5px",
              }}
            >
              {line(e)}
            </li>
          ))}
        </ul>
        <button
          ref={ok}
          type="button"
          onClick={dismissEndOfTurnReport}
          style={{
            alignSelf: "flex-end",
            fontFamily: "inherit",
            fontSize: "14px",
            fontWeight: 600,
            padding: "7px 22px",
            borderRadius: "4px",
            border: "1px solid var(--select)",
            background: "var(--select)",
            color: "var(--select-text)",
            cursor: "pointer",
          }}
        >
          {t("OK_BUTTON")}
        </button>
      </div>
    </div>
  );
}
