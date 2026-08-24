import { useState } from "react";
import { useEncounter } from "../state/store.js";
import { relevantDamageTypes } from "../rules/damage.js";
import { CONDITIONS, type ConditionSlug } from "../rules/conditions.js";
import { compareStrings } from "../rules/compare.js";

const CONDITION_OPTIONS = Object.values(CONDITIONS).sort((a, b) => compareStrings(a.name, b.name));

/**
 * The hover popover for a single row. Rendered by CombatantRow while the
 * pointer is inside the row-plus-popover wrapper — see CombatantRow for the
 * mouseenter/mouseleave handling that keeps it open across the gap.
 */
export function RowPopover({ combatantId }: { combatantId: string }): React.ReactElement | null {
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

  if (!combatant) return null;

  const relevant = relevantDamageTypes(combatant.iwr);
  const showSelector = intent === "damage" && relevant.length > 0;

  const handleDamage = (): void => {
    setIntent("damage");
    const value = Number(amount);
    // The selected type used to be dropped here entirely — IWR (including
    // immunity reducing the hit to nothing) is resolved in the store.
    if (Number.isFinite(value) && value > 0) applyDamage(combatantId, value, damageType);
    setDamageType("none");
  };

  const handleHeal = (): void => {
    setIntent("heal");
    const value = Number(amount);
    if (Number.isFinite(value) && value > 0) applyHealing(combatantId, value);
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

  return (
    <div
      // The row beneath this popover is now click-to-target. The popover
      // isn't a DOM descendant of the row (CombatantRow renders it as a
      // sibling), so a click here wouldn't reach the row's handler anyway —
      // stopping propagation here is defensive, per the brief, against that
      // structure ever changing.
      onClick={(e) => e.stopPropagation()}
      style={{
        position: "absolute",
        top: "-8px",
        left: "calc(100% + 10px)",
        width: "330px",
        zIndex: 20,
        padding: "12px 13px 13px",
        borderRadius: "5px",
        background: "var(--panel-high)",
        border: "1px solid oklch(0.46 0.05 200)",
        boxShadow: "0 12px 32px oklch(0.08 0.01 60 / 0.6)",
        display: "flex",
        flexDirection: "column",
        gap: "10px",
      }}
    >
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
                padding: "5px 9px",
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
                  padding: "5px 9px",
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
                  padding: "2px 4px 2px 7px",
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
}
