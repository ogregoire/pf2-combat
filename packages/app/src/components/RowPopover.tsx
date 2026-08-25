import { useState } from "react";
import { createPortal } from "react-dom";
import { useEncounter } from "../state/store.js";
import { applyIwr, relevantDamageTypes, type Iwr } from "../rules/damage.js";
import { CONDITIONS, type ConditionSlug } from "../rules/conditions.js";
import { compareStrings } from "../rules/compare.js";

const CONDITION_OPTIONS = Object.values(CONDITIONS).sort((a, b) => compareStrings(a.name, b.name));

/** Last damage/heal applied to this combatant, shown beside the HP line
 * until the next apply or the popover closes (component-local state, so
 * unmounting the popover — see CombatantRow — is what clears it). */
interface LastChange {
  delta: number; // negative for damage, positive for healing
  before: number;
  after: number;
  /** Set only when IWR changed the raw typed amount — explains the gap
   * between what the GM typed and what actually landed. */
  reason?: string;
}

/**
 * Describes why the applied amount differs from what the GM typed, e.g.
 * "30 cold, resistance 10". Mirrors applyIwr's own immunity/weakness/
 * resistance lookup (kept local rather than exported from damage.ts since
 * it's presentation, not rules logic).
 */
function describeIwrAdjustment(raw: number, type: string, iwr: Iwr | null): string {
  if (iwr === null || type === "none") return `${raw} ${type}`;
  if (iwr.immunities.includes(type)) return `${raw} ${type}, immune`;
  const weakness = iwr.weaknesses.find((w) => w.type === type && !(w.exceptions ?? []).includes(type));
  const resistance = iwr.resistances.find((r) => r.type === type && !(r.exceptions ?? []).includes(type));
  const parts: string[] = [];
  if (weakness) parts.push(`weakness ${weakness.value}`);
  if (resistance) parts.push(`resistance ${resistance.value}`);
  return parts.length > 0 ? `${raw} ${type}, ${parts.join(" / ")}` : `${raw} ${type}`;
}

/**
 * The row popover. On desktop it's the hover popover: rendered by
 * CombatantRow while the pointer is inside the row-plus-popover wrapper —
 * see CombatantRow for the mouseenter/mouseleave handling that keeps it open
 * across the gap. `narrow`/`targeted`/`onToggleTarget`/`onClose` are all
 * unused there (and default away) so that call site's behaviour is
 * unchanged.
 *
 * On a narrow screen there's no hover, so CombatantRow instead opens this on
 * tap and passes `narrow`. The row's own click no longer sets the target
 * there (see CombatantRow — a tap opens this popover instead), so the
 * popover carries an explicit Target control in its place; a full-screen
 * backdrop behind the panel is what "tap elsewhere" dismisses against, and
 * doubles as `onClose` for the panel's own Close button.
 */
export function RowPopover({
  combatantId,
  narrow = false,
  anchor = null,
  targeted = false,
  onToggleTarget,
  onClose,
}: {
  combatantId: string;
  narrow?: boolean;
  /** Viewport rect of the row this popover belongs to, from
   * CombatantRow. Desktop-only: the panel is portalled to `document.body`,
   * so it has no layout relationship to the row and must be placed from a
   * measurement. Null before the first measurement. */
  anchor?: DOMRect | null;
  targeted?: boolean;
  onToggleTarget?: () => void;
  onClose?: () => void;
}): React.ReactElement | null {
  const combatant = useEncounter((s) => s.encounter.combatants[combatantId]);
  const entry = useEncounter((s) => s.encounter.entries.find((e) => e.combatantIds.includes(combatantId)));
  const applyDamage = useEncounter((s) => s.applyDamage);
  const applyHealing = useEncounter((s) => s.applyHealing);
  const removeCombatant = useEncounter((s) => s.removeCombatant);
  const setInitiative = useEncounter((s) => s.setInitiative);
  const addCondition = useEncounter((s) => s.addCondition);
  const removeCondition = useEncounter((s) => s.removeCondition);

  const [damageType, setDamageType] = useState("none");
  const [amount, setAmount] = useState("");
  const [initiativeDraft, setInitiativeDraft] = useState<string | null>(null);
  const [conditionSlug, setConditionSlug] = useState<ConditionSlug>("off-guard");
  const [conditionValue, setConditionValue] = useState("1");
  const [conditionFormula, setConditionFormula] = useState("");
  // Which action the panel is currently set up for. Starts on "damage" (the
  // common case) so hovering alone still shows the selector for a creature
  // with relevant IWR. Healing has no damage type — DamagePopover.dc.html:
  // "Heal never shows the row at all" — so the selector is gated on this,
  // not just on whether the creature has relevant IWR.
  const [intent, setIntent] = useState<"damage" | "heal">("damage");
  const [lastChange, setLastChange] = useState<LastChange | null>(null);

  if (!combatant) return null;

  const relevant = relevantDamageTypes(combatant.iwr);
  const showSelector = intent === "damage" && relevant.length > 0;

  const handleDamage = (): void => {
    setIntent("damage");
    const value = Number(amount);
    // The selected type used to be dropped here entirely — IWR (including
    // immunity reducing the hit to nothing) is resolved in the store.
    if (Number.isFinite(value) && value > 0 && combatant.hp !== null) {
      const before = combatant.hp.current;
      const applied = applyIwr(value, damageType, combatant.iwr);
      const after = Math.max(0, before - applied);
      applyDamage(combatantId, value, damageType);
      setLastChange({
        delta: -applied,
        before,
        after,
        reason: applied !== value ? describeIwrAdjustment(value, damageType, combatant.iwr) : undefined,
      });
    }
    setDamageType("none");
  };

  const handleHeal = (): void => {
    setIntent("heal");
    const value = Number(amount);
    if (Number.isFinite(value) && value > 0 && combatant.hp !== null) {
      const before = combatant.hp.current;
      const after = Math.min(combatant.hp.max, before + value);
      applyHealing(combatantId, value);
      setLastChange({ delta: value, before, after });
    }
    setDamageType("none");
  };

  const commitInitiative = (): void => {
    if (entry && initiativeDraft !== null) {
      const value = Number(initiativeDraft);
      if (Number.isFinite(value)) setInitiative(entry.id, value);
    }
    setInitiativeDraft(null);
  };

  const conditionDef = CONDITIONS[conditionSlug];
  const handleAddCondition = (): void => {
    const value = conditionDef.valued ? Number(conditionValue) || 0 : 0;
    const formula = conditionSlug === "persistent-damage" && conditionFormula.trim() !== ""
      ? conditionFormula.trim()
      : undefined;
    addCondition(combatantId, conditionSlug, value, formula);
  };

  // Desktop keeps the placement beside the row (it's the only thing hover
  // ever needed), now measured rather than inherited from the row's box. A
  // narrow screen has no room to the side of a full-width row for that, so
  // there the panel instead sits in normal flow inside a fixed full-screen
  // backdrop below, bottom-sheet style.
  const panelStyle: React.CSSProperties = narrow
    ? {
        width: "min(420px, 100%)",
        maxHeight: "min(560px, 85vh)",
        overflowY: "auto",
        padding: "14px 15px 16px",
        borderRadius: "10px 10px 0 0",
        background: "var(--panel-high)",
        border: "1px solid oklch(0.46 0.05 200)",
        borderBottom: "none",
        boxShadow: "0 -12px 32px oklch(0.08 0.01 60 / 0.6)",
        display: "flex",
        flexDirection: "column",
        gap: "10px",
      }
    : {
        // Fixed, not absolute: the combatant list is a 340px-wide
        // `overflow-y: auto` scroller, and CSS forces its overflow-x to
        // `auto` too, so an absolutely-positioned panel sitting to the
        // right of the row was clipped to zero visible width. Fixed
        // positioning takes the viewport as its containing block, and the
        // portal below takes the panel out of the scroller entirely.
        position: "fixed",
        top: `${(anchor?.top ?? 0) - 8}px`,
        left: `${(anchor?.right ?? 0) + 10}px`,
        width: "330px",
        maxHeight: "calc(100vh - 24px)",
        overflowY: "auto",
        zIndex: 60,
        padding: "12px 13px 13px",
        borderRadius: "5px",
        background: "var(--panel-high)",
        border: "1px solid oklch(0.46 0.05 200)",
        boxShadow: "0 12px 32px oklch(0.08 0.01 60 / 0.6)",
        display: "flex",
        flexDirection: "column",
        gap: "10px",
      };

  const panel = (
    <div
      // The row beneath this popover is click-to-target on desktop. The
      // popover isn't a DOM descendant of the row (CombatantRow renders it
      // as a sibling), so a click here wouldn't reach the row's handler
      // anyway — stopping propagation here is defensive, per the brief,
      // against that structure ever changing. On narrow it also keeps a tap
      // on the panel itself from reaching the full-screen backdrop's
      // onClose below.
      onClick={(e) => e.stopPropagation()}
      style={panelStyle}
    >
      {narrow && (
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <button
            type="button"
            aria-pressed={targeted}
            onClick={onToggleTarget}
            style={{
              fontFamily: "inherit",
              fontSize: "12.5px",
              fontWeight: 600,
              padding: "9px 14px",
              borderRadius: "4px",
              border: `1px solid ${targeted ? "oklch(0.80 0.15 95)" : "var(--border-strong)"}`,
              background: targeted ? "oklch(0.34 0.06 95)" : "var(--panel-raised)",
              color: "var(--text)",
              cursor: "pointer",
            }}
          >
            {targeted ? "Targeted" : "Target"}
          </button>
          <div style={{ flexGrow: 1 }} />
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            style={{
              fontFamily: "inherit",
              fontSize: "13px",
              fontWeight: 600,
              padding: "9px 14px",
              borderRadius: "4px",
              border: "1px solid var(--border-strong)",
              background: "var(--panel-raised)",
              color: "var(--text-dim)",
              cursor: "pointer",
            }}
          >
            Close
          </button>
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <span style={{ fontSize: "13px", fontWeight: 600 }}>{combatant.name}</span>
        {combatant.hp !== null && (
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "11.5px", color: "var(--text-dim)" }}>
            {combatant.hp.current}/{combatant.hp.max}
          </span>
        )}
        <div style={{ flexGrow: 1 }} />
        {entry && (
          <input
            aria-label="Initiative"
            value={initiativeDraft ?? String(entry.initiative)}
            onFocus={() => setInitiativeDraft(String(entry.initiative))}
            onChange={(e) => setInitiativeDraft(e.target.value)}
            onBlur={commitInitiative}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            }}
            style={{
              width: "38px",
              fontFamily: "var(--font-mono)",
              fontSize: "12px",
              textAlign: "center",
              padding: "3px 4px",
              borderRadius: "3px",
              border: "1px solid var(--border-strong)",
              background: "var(--bg)",
              color: "var(--text)",
            }}
          />
        )}
        <button
          type="button"
          aria-label={`Remove ${combatant.name}`}
          onClick={() => removeCombatant(combatantId)}
          style={{
            fontFamily: "inherit",
            fontSize: "11px",
            padding: "3px 8px",
            borderRadius: "3px",
            border: "1px solid var(--border)",
            background: "var(--panel-raised)",
            color: "var(--text-dim)",
            cursor: "pointer",
          }}
        >
          Remove
        </button>
      </div>

      {lastChange && (
        <div style={{ display: "flex", alignItems: "baseline", gap: "6px", flexWrap: "wrap" }}>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "12px",
              fontWeight: 600,
              color: lastChange.delta < 0 ? "var(--danger)" : "var(--ok)",
            }}
          >
            {lastChange.delta < 0 ? "−" : "+"}
            {Math.abs(lastChange.delta)}
          </span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "11px", color: "var(--text-dim)" }}>
            {lastChange.before} → {lastChange.after}
            {lastChange.reason ? ` (${lastChange.reason})` : ""}
          </span>
        </div>
      )}

      {intent === "damage" && relevant.length === 0 ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "7px",
            padding: "7px 9px",
            borderRadius: "3px",
            background: "var(--bg)",
            border: "1px solid var(--border)",
          }}
        >
          <span style={{ fontSize: "11.5px", color: "var(--text-faint)" }}>
            No immunities, weaknesses or resistances — damage type is irrelevant here.
          </span>
        </div>
      ) : showSelector ? (
        <div>
          <div
            style={{
              fontSize: "10px",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "var(--text-faint)",
              marginBottom: "6px",
            }}
          >
            Damage type — {relevant.length} relevant
          </div>
          <div role="group" aria-label="damage type" style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
            <button
              type="button"
              aria-pressed={damageType === "none"}
              onClick={() => setDamageType("none")}
              style={{
                fontFamily: "inherit",
                fontSize: "11.5px",
                fontWeight: 600,
                padding: "8px 10px", // bumped for a comfortable tap target on narrow screens
                borderRadius: "3px",
                cursor: "pointer",
                background: damageType === "none" ? "oklch(0.38 0.03 60)" : "var(--bg)",
                border: `1px solid ${damageType === "none" ? "oklch(0.56 0.05 60)" : "var(--border)"}`,
                color: "var(--text)",
              }}
            >
              None
            </button>
            {relevant.map((r) => (
              <button
                key={r.type}
                type="button"
                aria-pressed={damageType === r.type}
                onClick={() => setDamageType(r.type)}
                style={{
                  fontFamily: "inherit",
                  fontSize: "11.5px",
                  padding: "8px 10px", // bumped for a comfortable tap target on narrow screens
                  borderRadius: "3px",
                  cursor: "pointer",
                  background: damageType === r.type ? "oklch(0.30 0.03 60)" : "var(--bg)",
                  border: `1px solid ${damageType === r.type ? "oklch(0.56 0.05 60)" : "var(--border)"}`,
                  color: "var(--text-dim)",
                }}
              >
                {r.type}{" "}
                <span style={{ fontFamily: "var(--font-mono)", fontSize: "10px", opacity: 0.85 }}>{r.label}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {combatant.hp === null && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "7px",
            padding: "7px 9px",
            borderRadius: "3px",
            background: "var(--bg)",
            border: "1px solid var(--border)",
          }}
        >
          <span style={{ fontSize: "11.5px", color: "var(--text-faint)" }}>
            No HP on record — Damage and Heal are disabled.
          </span>
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: "7px" }}>
        <input
          aria-label="amount"
          value={amount}
          disabled={combatant.hp === null}
          onChange={(e) => setAmount(e.target.value)}
          style={{
            width: "62px",
            fontFamily: "var(--font-mono)",
            fontSize: "17px",
            fontWeight: 600,
            textAlign: "center",
            padding: "8px 6px",
            borderRadius: "3px",
            border: "1px solid oklch(0.46 0.05 200)",
            background: "var(--bg)",
            color: "var(--text)",
            opacity: combatant.hp === null ? 0.5 : 1,
          }}
        />
        <button
          type="button"
          disabled={combatant.hp === null}
          onClick={handleDamage}
          style={{
            fontFamily: "inherit",
            flexGrow: 1,
            fontSize: "13px",
            fontWeight: 600,
            padding: "9px 10px",
            borderRadius: "3px",
            border: "1px solid oklch(0.48 0.14 28)",
            background: "var(--danger-bg)",
            color: "oklch(0.93 0.06 35)",
            cursor: combatant.hp === null ? "default" : "pointer",
            opacity: combatant.hp === null ? 0.45 : 1,
          }}
        >
          Damage
        </button>
        <button
          type="button"
          disabled={combatant.hp === null}
          onClick={handleHeal}
          style={{
            fontFamily: "inherit",
            flexGrow: 1,
            fontSize: "13px",
            fontWeight: 600,
            padding: "9px 10px",
            borderRadius: "3px",
            border: "1px solid oklch(0.42 0.11 145)",
            background: "var(--ok-bg)",
            color: "oklch(0.90 0.07 145)",
            cursor: combatant.hp === null ? "default" : "pointer",
            opacity: combatant.hp === null ? 0.45 : 1,
          }}
        >
          Heal
        </button>
      </div>

      <div style={{ borderTop: "1px solid var(--border)", paddingTop: "10px", display: "flex", flexDirection: "column", gap: "6px" }}>
        <div style={{ fontSize: "10px", letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-faint)" }}>
          Add condition
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <select
            aria-label="Condition"
            value={conditionSlug}
            onChange={(e) => setConditionSlug(e.target.value as ConditionSlug)}
            style={{
              flexGrow: 1,
              fontFamily: "inherit",
              fontSize: "12.5px",
              padding: "6px 7px",
              borderRadius: "3px",
              border: "1px solid var(--border-strong)",
              background: "var(--bg)",
              color: "var(--text)",
            }}
          >
            {CONDITION_OPTIONS.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.name}
              </option>
            ))}
          </select>
          {conditionDef.valued && (
            <input
              aria-label="Condition value"
              value={conditionValue}
              onChange={(e) => setConditionValue(e.target.value)}
              style={{
                width: "42px",
                fontFamily: "var(--font-mono)",
                fontSize: "13px",
                textAlign: "center",
                padding: "6px 4px",
                borderRadius: "3px",
                border: "1px solid var(--border-strong)",
                background: "var(--bg)",
                color: "var(--text)",
              }}
            />
          )}
          <button
            type="button"
            onClick={handleAddCondition}
            style={{
              fontFamily: "inherit",
              fontSize: "12px",
              fontWeight: 600,
              padding: "6px 10px",
              borderRadius: "3px",
              border: "1px solid var(--border-strong)",
              background: "var(--panel-raised)",
              color: "var(--text)",
              cursor: "pointer",
            }}
          >
            Add
          </button>
        </div>
        {conditionSlug === "persistent-damage" && (
          <input
            aria-label="Persistent damage formula"
            placeholder="e.g. 2d6"
            value={conditionFormula}
            onChange={(e) => setConditionFormula(e.target.value)}
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "12.5px",
              padding: "6px 7px",
              borderRadius: "3px",
              border: "1px solid var(--border-strong)",
              background: "var(--bg)",
              color: "var(--text)",
            }}
          />
        )}
        {combatant.conditions.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "5px", marginTop: "2px" }}>
            {combatant.conditions.map((c) => (
              <button
                key={c.slug}
                type="button"
                aria-label={`Remove ${CONDITIONS[c.slug].name}`}
                onClick={() => removeCondition(combatantId, c.slug)}
                style={{
                  fontFamily: "inherit",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "5px",
                  fontSize: "10.5px",
                  letterSpacing: "0.04em",
                  padding: "7px 8px 7px 10px", // bumped for a comfortable tap target on narrow screens
                  borderRadius: "3px",
                  border: "1px solid var(--border)",
                  background: "var(--cond-bg)",
                  color: "var(--cond)",
                  cursor: "pointer",
                }}
              >
                {CONDITIONS[c.slug].valued ? `${CONDITIONS[c.slug].name.toUpperCase()} ${c.value}` : CONDITIONS[c.slug].name.toUpperCase()}
                <span aria-hidden="true">×</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  // document.body, so no ancestor's `overflow` can clip it. Guarded for a
  // non-DOM environment (SSR/tests without a document).
  if (!narrow) return typeof document === "undefined" ? panel : createPortal(panel, document.body);

  // Full-screen backdrop: this is what "tap elsewhere dismisses it" means
  // here. The panel above stops its own clicks from bubbling here, so only
  // a genuine tap outside it reaches this onClose.
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "oklch(0.08 0.01 60 / 0.6)",
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        zIndex: 30,
      }}
    >
      {panel}
    </div>
  );
}
