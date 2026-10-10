import { resolveCreatureName } from "../data/i18nOverlay.js";
import { useCombatantI18n } from "../hooks/useCombatantI18n.js";
import { format, useT } from "../i18n/index.js";
import { useEncounter } from "../state/store.js";
import type { Combatant } from "../state/types.js";
import { DefenseSummary } from "./DefenseSummary.js";

const boxStyle: React.CSSProperties = {
  padding: "14px 16px",
  borderRadius: "5px",
  background: "var(--panel-high)",
  border: "1px solid var(--border)",
  fontSize: "13px",
  color: "var(--text-dim)",
};

const smallButtonStyle: React.CSSProperties = {
  fontFamily: "inherit",
  fontSize: "12px",
  padding: "4px 9px",
  borderRadius: "3px",
  border: "1px solid var(--border-strong)",
  background: "var(--panel-raised)",
  color: "var(--text-dim)",
  cursor: "pointer",
};

/** One candidate: its name and level over its DefenseSummary, the whole card
 * a button. Its own component so each candidate resolves its French name
 * through its own `useCombatantI18n`. */
function Candidate({ combatant, onPick }: { combatant: Combatant; onPick: () => void }): React.ReactElement {
  const t = useT();
  const lang = useEncounter((s) => s.lang);
  const i18n = useCombatantI18n(combatant);
  const name = resolveCreatureName(combatant.name, i18n, lang);
  return (
    <button
      type="button"
      aria-label={format(t("TARGET_NAME_ARIA"), { name })}
      onClick={onPick}
      style={{
        fontFamily: "inherit",
        textAlign: "left",
        color: "var(--text)",
        display: "flex",
        flexDirection: "column",
        gap: "6px",
        padding: "9px 11px",
        borderRadius: "4px",
        border: "1px solid var(--border)",
        borderLeft: `3px solid ${combatant.kind === "pc" ? "var(--pc)" : "var(--border-strong)"}`,
        background: "var(--panel-raised)",
        cursor: "pointer",
      }}
    >
      <span style={{ display: "flex", alignItems: "baseline", gap: "6px" }}>
        <span style={{ fontSize: "13.5px", fontWeight: 600 }}>{name}</span>
        <span style={{ fontSize: "11px", color: "var(--text-faint)" }}>
          {`${t(combatant.kind === "pc" ? "PC_PREFIX" : "CREATURE_PREFIX")} ${combatant.level}`}
        </span>
      </span>
      <DefenseSummary combatant={combatant} />
    </button>
  );
}

/** The roll assistant's way to choose a target. Closed, it is a single
 * "Select a target" button; open, it lists everyone who can be targeted —
 * in initiative order, without the attacker or the defeated — each with its
 * defensive stats, so the GM picks a target by how hurt and how well
 * defended it is. Picking one sets the encounter's target and closes. */
export function TargetPicker({
  attackerId,
  open,
  onOpen,
  onClose,
}: {
  attackerId: string;
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
}): React.ReactElement {
  const t = useT();
  const entries = useEncounter((s) => s.encounter.entries);
  const combatants = useEncounter((s) => s.encounter.combatants);
  const setTarget = useEncounter((s) => s.setTarget);

  if (!open) {
    return (
      <button
        type="button"
        onClick={onOpen}
        style={{ ...boxStyle, fontFamily: "inherit", textAlign: "left", color: "var(--text)", fontWeight: 600, cursor: "pointer" }}
      >
        {t("SELECT_TARGET_BUTTON")}
      </button>
    );
  }

  const candidates = entries
    .flatMap((e) => e.combatantIds)
    .map((id) => combatants[id])
    .filter((c): c is Combatant => c !== undefined && c.id !== attackerId && !c.defeated);

  return (
    <div role="group" aria-label={t("TARGET_PICKER_HEADING")} style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: "10px", letterSpacing: "0.09em", color: "var(--text-faint)" }}>
          {t("TARGET_PICKER_HEADING").toUpperCase()}
        </span>
        <button type="button" onClick={onClose} style={smallButtonStyle}>
          {t("LABEL_CANCEL")}
        </button>
      </div>
      {candidates.length === 0 ? (
        <div style={boxStyle}>{t("NO_TARGETS_MSG")}</div>
      ) : (
        candidates.map((c) => (
          <Candidate
            key={c.id}
            combatant={c}
            onPick={() => {
              setTarget(c.id);
              onClose();
            }}
          />
        ))
      )}
    </div>
  );
}

/** The chosen target: its name, its DefenseSummary, and the controls to
 * change or clear it. `target.name` arrives already resolved to the display
 * language (ActiveCombatant does that). */
export function TargetBox({ target, onChange }: { target: Combatant; onChange: () => void }): React.ReactElement {
  const t = useT();
  const setTarget = useEncounter((s) => s.setTarget);
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "8px",
        padding: "10px 14px",
        borderRadius: "5px",
        background: "var(--panel-raised)",
        border: "1px solid var(--border)",
        borderLeft: "3px solid var(--target)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
        <span style={{ fontSize: "10px", letterSpacing: "0.09em", color: "var(--text-faint)" }}>{t("TARGET_LABEL_CAPS")}</span>
        <span style={{ fontSize: "14px", fontWeight: 600 }}>{target.name}</span>
        <div style={{ flexGrow: 1 }} />
        <button type="button" onClick={onChange} style={smallButtonStyle}>
          {t("CHANGE_TARGET_BUTTON")}
        </button>
        <button
          type="button"
          aria-label={t("CLEAR_TARGET_ARIA")}
          title={t("CLEAR_TARGET_ARIA")}
          onClick={() => setTarget(null)}
          style={{ ...smallButtonStyle, display: "inline-flex", alignItems: "center", justifyContent: "center", width: "26px", height: "26px", padding: 0 }}
        >
          <svg width="12" height="12" viewBox="0 0 14 14" aria-hidden="true">
            <path d="M2 2l10 10M12 2L2 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      <DefenseSummary combatant={target} />
    </div>
  );
}
