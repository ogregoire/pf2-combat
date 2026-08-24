import { useState } from "react";
import { useEncounter } from "../state/store.js";
import { relevantDamageTypes } from "../rules/damage.js";

/**
 * The hover popover for a single row. Rendered by CombatantRow while the
 * pointer is inside the row-plus-popover wrapper — see CombatantRow for the
 * mouseenter/mouseleave handling that keeps it open across the gap.
 */
export function RowPopover({ combatantId }: { combatantId: string }): React.ReactElement | null {
  const combatant = useEncounter((s) => s.encounter.combatants[combatantId]);
  const applyDamage = useEncounter((s) => s.applyDamage);
  const applyHealing = useEncounter((s) => s.applyHealing);

  const [damageType, setDamageType] = useState("none");
  const [amount, setAmount] = useState("");
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
    if (Number.isFinite(value) && value > 0) applyDamage(combatantId, value);
    setDamageType("none");
  };

  const handleHeal = (): void => {
    setIntent("heal");
    const value = Number(amount);
    if (Number.isFinite(value) && value > 0) applyHealing(combatantId, value);
    setDamageType("none");
  };

  return (
    <div
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
      <div style={{ display: "flex", alignItems: "baseline", gap: "8px" }}>
        <span style={{ fontSize: "13px", fontWeight: 600 }}>{combatant.name}</span>
        {combatant.hp !== null && (
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "11.5px", color: "var(--text-dim)" }}>
            {combatant.hp.current}/{combatant.hp.max}
          </span>
        )}
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

      <div style={{ display: "flex", alignItems: "center", gap: "7px" }}>
        <input
          aria-label="amount"
          value={amount}
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
          }}
        />
        <button
          type="button"
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
            cursor: "pointer",
          }}
        >
          Damage
        </button>
        <button
          type="button"
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
            cursor: "pointer",
          }}
        >
          Heal
        </button>
      </div>
    </div>
  );
}
