import type { Attack } from "@pf2/schema";
import { mapLadder } from "../rules/map.js";
import type { TraitInfo } from "../rules/traitInfo.js";
import { CostPips } from "./ActionCard.js";
import { TraitTag } from "./TraitTag.js";

function formatSigned(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`;
}

function damageText(attack: Attack): string {
  return attack.damage.map((d) => `${d.formula} ${d.type}`).join(" + ");
}

/** One Strike, now just another 1-action row in the merged action list —
 * same cost pip as any other action, so "what does this cost" never means
 * hunting a separate Strikes panel. The three-rung MAP ladder (the rung the
 * combatant's `strikesMade` lands on highlighted) is unchanged in behaviour
 * and appearance, per the brief: the GM specifically praised it. Pressing
 * the row selects it for the RollAssistant; it does not itself record a
 * strike or spend from the action pool — recording is the assistant's own
 * explicit button. */
export function StrikeCard({
  attack,
  selected,
  activeRung,
  onSelect,
  glossary,
}: {
  attack: Attack;
  selected: boolean;
  activeRung: number;
  onSelect: () => void;
  glossary: Map<string, TraitInfo>;
}): React.ReactElement {
  const agile = attack.traits.includes("agile");
  const ladder = mapLadder(attack.bonus, agile);

  return (
    <button
      type="button"
      onClick={onSelect}
      style={{
        fontFamily: "inherit",
        textAlign: "left",
        width: "100%",
        // Same frame as ActionCard's enabled state — a Strike is an action,
        // and a thinner border here made the list read as two kinds of row.
        // Selection is carried by the background alone.
        padding: "11px 14px",
        borderRadius: "4px",
        background: selected ? "var(--panel-high)" : "var(--panel-raised)",
        border: "1px solid var(--border-strong)",
        cursor: "pointer",
        color: "var(--text)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
        <CostPips cost="1" />
        <span style={{ fontWeight: 600 }}>{attack.name}</span>
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
      </div>
      {attack.traits.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", marginTop: "6px" }}>
          {attack.traits.map((t) => (
            <TraitTag key={t} trait={t} glossary={glossary} />
          ))}
        </div>
      )}
    </button>
  );
}
