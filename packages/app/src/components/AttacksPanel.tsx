import { mapLadder } from "../rules/map.js";
import { useEncounter } from "../state/store.js";
import type { Combatant } from "../state/types.js";

function formatSigned(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`;
}

function damageText(attack: Combatant["attacks"][number]): string {
  return attack.damage.map((d) => `${d.formula} ${d.type}`).join(" + ");
}

/** Main.dc.html's Strikes list: each attack's name, its three-rung MAP
 * ladder (mapLadder — the applicable rung highlighted by the combatant's
 * `strikesMade`), damage and traits. Pressing a row selects it for the
 * RollAssistant; it does not itself record a strike — recording is the
 * assistant's own explicit button, so browsing the ladder never advances
 * MAP by accident. */
export function AttacksPanel({
  combatant,
  selectedIndex,
  onSelect,
}: {
  combatant: Combatant;
  selectedIndex: number | null;
  onSelect: (index: number) => void;
}): React.ReactElement | null {
  const resetStrikes = useEncounter((s) => s.resetStrikes);
  if (combatant.attacks.length === 0) return null;

  const activeRung = Math.min(combatant.strikesMade, 2);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", gap: "10px", marginBottom: "8px" }}>
        <div style={{ fontSize: "11px", letterSpacing: "0.09em", textTransform: "uppercase", color: "var(--text-faint)" }}>
          Strikes
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "7px",
            padding: "2px 8px 3px",
            borderRadius: "3px",
            background: "var(--accent-bg)",
            border: "1px solid var(--border-strong)",
          }}
        >
          <span style={{ fontSize: "10px", letterSpacing: "0.07em", color: "var(--accent-text)" }}>
            STRIKES THIS TURN
          </span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "13px", fontWeight: 600, color: "var(--accent-text)" }}>
            {combatant.strikesMade}
          </span>
        </div>
        <button
          type="button"
          onClick={() => resetStrikes(combatant.id)}
          style={{
            fontFamily: "inherit",
            fontSize: "11px",
            padding: "2px 8px",
            borderRadius: "3px",
            border: "1px solid var(--border)",
            background: "var(--panel-raised)",
            color: "var(--text-dim)",
            cursor: "pointer",
          }}
        >
          reset
        </button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        {combatant.attacks.map((attack, i) => {
          const agile = attack.traits.includes("agile");
          const ladder = mapLadder(attack.bonus, agile);
          return (
            <button
              key={`${attack.name}-${i}`}
              type="button"
              onClick={() => onSelect(i)}
              style={{
                fontFamily: "inherit",
                textAlign: "left",
                display: "flex",
                alignItems: "center",
                gap: "14px",
                padding: "10px 14px",
                borderRadius: "4px",
                background: selectedIndex === i ? "var(--panel-high)" : "var(--panel-raised)",
                border: `1px solid ${selectedIndex === i ? "var(--border-strong)" : "var(--border)"}`,
                cursor: "pointer",
                color: "var(--text)",
              }}
            >
              <span style={{ fontWeight: 500, width: "150px" }}>{attack.name}</span>
              <div style={{ display: "flex", gap: "3px" }}>
                {ladder.map((bonus, rung) => (
                  <span
                    key={rung}
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: rung === activeRung ? "17px" : "13px",
                      fontWeight: rung === activeRung ? 600 : 400,
                      padding: rung === activeRung ? "2px 10px" : "3px 8px",
                      borderRadius: "3px",
                      color: rung === activeRung ? "var(--accent-text)" : "var(--text-faint)",
                      background: rung === activeRung ? "var(--accent-bg)" : "var(--bg)",
                      border: rung === activeRung ? "1px solid var(--border-strong)" : "none",
                    }}
                  >
                    {formatSigned(bonus)}
                  </span>
                ))}
              </div>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "13px", color: "var(--text-dim)" }}>
                {damageText(attack)}
              </span>
              <div style={{ flexGrow: 1 }} />
              {attack.traits.map((t) => (
                <span
                  key={t}
                  style={{
                    fontSize: "10px",
                    letterSpacing: "0.05em",
                    padding: "2px 6px",
                    borderRadius: "2px",
                    background: "var(--border)",
                    color: "var(--text-dim)",
                  }}
                >
                  {t.replace(/-/g, " ").toUpperCase()}
                </span>
              ))}
            </button>
          );
        })}
      </div>
    </div>
  );
}
