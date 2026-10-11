import type { Attack } from "@pf2/schema";
import { conditionModifiers, type AppliedCondition } from "../rules/conditions.js";
import { damageTypeName } from "../rules/damage.js";
import { mapLadder } from "../rules/map.js";
import { resolveModifiers } from "../rules/modifiers.js";
import type { TraitInfo } from "../rules/traitInfo.js";
import { useEncounter } from "../state/store.js";
import { CostPips } from "./ActionCard.js";
import { TraitTag } from "./TraitTag.js";
import { DamageTypeIcon, damageTypeStyle } from "./damageTypes.js";
import { deltaColor, deltaTone } from "./deltaTone.js";

function formatSigned(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`;
}

// The selected Strike's frame: the ink --select treatment every plain UI
// selection uses (tabs, catalogue rows, the MAP rung). Deliberately not the
// gold of "whose turn it is" nor the magenta of "targeted" — selecting a
// Strike to read it has no game meaning, so it gets no hue.
const SELECTED_BG = "var(--select-bg)";
const SELECTED_BORDER = "var(--select)";
const SELECTED_RING = "0 0 0 1px var(--select)";

/**
 * A strike's damage line, one entry per damage component. The formula stays
 * neutral mono — it's a number to read — while the type takes its own colour
 * and glyph from the same table the damage popover's selector uses, so a
 * strike's fire component and the creature's fire resistance read alike.
 */
function DamageLine({ attack }: { attack: Attack }): React.ReactElement {
  const lang = useEncounter((s) => s.lang);
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
      {attack.damage.map((d, i) => (
        <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}>
          {i > 0 && <span style={{ color: "var(--text-faint)" }}>+</span>}
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "13px", color: "var(--text-dim)" }}>
            {d.formula}
          </span>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
              fontSize: "12px",
              color: damageTypeStyle(d.type).color,
            }}
          >
            <DamageTypeIcon type={d.type} size={11} />
            {damageTypeName(d.type, lang)}
          </span>
        </span>
      ))}
    </span>
  );
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
  conditions = [],
}: {
  attack: Attack;
  selected: boolean;
  activeRung: number;
  onSelect: () => void;
  glossary: Map<string, TraitInfo>;
  /** The attacker's conditions: the ladder shows the bonus they leave —
   * frightened 1 turns +12/+7/+2 into +11/+6/+1, in red. */
  conditions?: AppliedCondition[];
}): React.ReactElement {
  const agile = attack.traits.includes("agile");
  const mods = resolveModifiers(conditionModifiers(conditions, attack.kind === "melee" ? "melee-attack" : "ranged-attack"));
  const why = mods.applied.map((m) => `${m.value} ${m.source}`).join(", ");
  const tone = deltaTone(mods.total);
  const ladder = mapLadder(attack.bonus + mods.total, agile);

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
        //
        // Selection used to be carried by the background alone: --panel-raised
        // to --panel-high is a 0.025 lightness step at near-zero chroma, which
        // is hard to spot at a lit table and on a tablet. It now gets an ink
        // border and ring (SELECTED_*), so the selected Strike reads at a glance.
        padding: "11px 14px",
        borderRadius: "4px",
        background: selected ? SELECTED_BG : "var(--panel-raised)",
        border: `1px solid ${selected ? SELECTED_BORDER : "var(--border-strong)"}`,
        boxShadow: selected ? SELECTED_RING : "none",
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
              title={why || undefined}
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: rung === activeRung ? "17px" : "13px",
                fontWeight: rung === activeRung ? 600 : 400,
                padding: rung === activeRung ? "2px 10px" : "3px 8px",
                borderRadius: "3px",
                // A moved bonus can't stay white-on-ink: the active rung takes
                // the tone's tinted chip instead, size and weight still marking it.
                ...(tone === null
                  ? {
                      color: rung === activeRung ? "var(--select-text)" : "var(--text-faint)",
                      background: rung === activeRung ? "var(--select)" : "var(--bg)",
                      border: rung === activeRung ? "1px solid var(--border-strong)" : "none",
                    }
                  : {
                      color: deltaColor(mods.total),
                      background: rung === activeRung ? `var(--${tone}-bg)` : "var(--bg)",
                      border: rung === activeRung ? `1px solid var(--${tone}-border)` : "none",
                    }),
              }}
            >
              {formatSigned(bonus)}
            </span>
          ))}
        </div>
        <DamageLine attack={attack} />
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
