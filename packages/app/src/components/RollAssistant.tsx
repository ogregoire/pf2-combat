import { useEffect, useRef, useState } from "react";
import type { Attack } from "@pf2/schema";
import { format, useT, type StringKey } from "../i18n/index.js";
import { degreeTotalRanges, type Degree } from "../rules/degrees.js";
import { ATTACK_BONUS_SOURCE, resolveStrike } from "../rules/strike.js";
import { useEncounter } from "../state/store.js";
import type { Combatant } from "../state/types.js";
import { TargetBox, TargetPicker } from "./TargetPicker.js";
import { hover, modifiersHover } from "./HoverCard.js";
import { deltaColor } from "./deltaTone.js";

function formatSigned(n: number): string {
  return n >= 0 ? `+${n}` : `−${Math.abs(n)}`;
}


const DEGREE_LABEL_KEY: Record<Degree, StringKey> = {
  "critical-success": "DEGREE_CRITICAL_SUCCESS",
  success: "DEGREE_SUCCESS",
  failure: "DEGREE_FAILURE",
  "critical-failure": "DEGREE_CRITICAL_FAILURE",
};

/** A single endpoint of a total range, coloured when it's the exact total a
 * natural 1 or natural 20 produces (`--danger`/`--ok`) — unconditionally,
 * regardless of which degree that roll landed in, since the whole point of
 * the natural-1/20 rule is that the shift can move it into a band its total
 * wouldn't otherwise belong to. Plain text otherwise. */
function Total({ value, natOne, natTwenty }: { value: number; natOne: number; natTwenty: number }): React.ReactElement {
  const color = value === natTwenty ? "var(--ok)" : value === natOne ? "var(--danger)" : undefined;
  return <span style={{ color }}>{value}</span>;
}

/** Renders one row's range cell: "—" when no face reaches the degree, a
 * bare total when only one does, "low-high" otherwise — each endpoint
 * coloured independently by `Total`. */
function RangeCell({
  low,
  high,
  natOne,
  natTwenty,
}: {
  low: number | null;
  high: number | null;
  natOne: number;
  natTwenty: number;
}): React.ReactElement {
  if (low === null || high === null) return <span>—</span>;
  if (low === high) return <Total value={low} natOne={natOne} natTwenty={natTwenty} />;
  return (
    <span>
      <Total value={low} natOne={natOne} natTwenty={natTwenty} />-
      <Total value={high} natOne={natOne} natTwenty={natTwenty} />
    </span>
  );
}

const ORDINAL_KEYS: StringKey[] = ["ORDINAL_1", "ORDINAL_2", "ORDINAL_3", "ORDINAL_4", "ORDINAL_5"];

function ordinal(t: (key: StringKey) => string, strikesMade: number): string {
  return t(ORDINAL_KEYS[Math.min(strikesMade, ORDINAL_KEYS.length - 1)]!);
}

/** TurnAssistant.dc.html's right column, the defensive side of the turn:
 * target, modifier ledger, roll line and the four-row outcome ladder — all
 * read straight off `resolveStrike`, never re-derived. The target is chosen
 * here, through TargetPicker, which lists every candidate with its
 * defences; with no target there's nothing to compute against, so the
 * picker stands in for the whole assistant, opening as the pointer
 * enters the zone. */
export function RollAssistant({
  combatant,
  target,
  attack,
}: {
  combatant: Combatant;
  target: Combatant | undefined;
  attack: Attack | undefined;
}): React.ReactElement {
  const recordStrike = useEncounter((s) => s.recordStrike);
  const spendActions = useEncounter((s) => s.spendActions);
  const lang = useEncounter((s) => s.lang);
  const t = useT();
  const [picking, setPicking] = useState(false);
  // Moving the pointer from the zone onto a candidate inside it is one
  // continuous hover, but jsdom/user-event report it as a leave then an
  // enter (no relatedTarget) — the same quirk CombatantRow absorbs. The
  // close waits a tick and an immediate re-enter cancels it.
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (closeTimer.current !== null) clearTimeout(closeTimer.current);
  }, []);
  const cancelClose = (): void => {
    if (closeTimer.current !== null) clearTimeout(closeTimer.current);
    closeTimer.current = null;
  };

  if (!target || picking) {
    // With no target yet, the whole zone opens the list on hover, and
    // leaving it closes the list again; a click (and a tap, where there is
    // no hover) still opens it too. Once a target is chosen the zone shows
    // the to-hit box instead, and Change reopens the list.
    return (
      <div
        data-testid="target-zone"
        onMouseEnter={() => {
          cancelClose();
          if (!target) setPicking(true);
        }}
        onMouseLeave={() => {
          cancelClose();
          closeTimer.current = setTimeout(() => setPicking(false), 0);
        }}
        style={{ minHeight: "100%" }}
      >
        <TargetPicker
          attackerId={combatant.id}
          open={picking}
          onOpen={() => setPicking(true)}
          onClose={() => setPicking(false)}
        />
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      <TargetBox target={target} onChange={() => setPicking(true)} />

      {!attack ? (
        <div style={{ padding: "14px 16px", borderRadius: "5px", background: "var(--panel-high)", border: "1px solid var(--border)", fontSize: "13px", color: "var(--text-dim)" }}>
          {t("SELECT_STRIKE_MSG")}
        </div>
      ) : target.ac === null ? (
        <div style={{ padding: "14px 16px", borderRadius: "5px", background: "var(--panel-high)", border: "1px solid var(--border)", fontSize: "13px", color: "var(--text-dim)" }}>
          {format(t("TARGET_AC_UNKNOWN_MSG"), { name: target.name })}
        </div>
      ) : (
        (() => {
          const resolution = resolveStrike({
            bonus: attack.bonus,
            kind: attack.kind,
            agile: attack.traits.includes("agile"),
            strikesMade: combatant.strikesMade,
            attackerConditions: combatant.conditions,
            targetConditions: target.conditions,
            attackerEffects: combatant.effects,
            targetEffects: target.effects,
            targetAc: target.ac!,
            damage: attack.damage.map((d) => ({ formula: d.formula, type: d.type, category: d.category })),
            traits: attack.traits,
            lang,
          });
          const rollLine = `1d20 ${resolution.modifier >= 0 ? "+" : "−"} ${Math.abs(resolution.modifier)}`;

          return (
            <div style={{ padding: "14px 16px", borderRadius: "5px", background: "var(--panel-high)", border: "1px solid var(--border-strong)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <span style={{ fontSize: "16px", fontWeight: 600 }}>{attack.name}</span>
                <span style={{ fontSize: "11px", color: "var(--text-faint)" }}>
                  {format(t("STRIKE_THIS_TURN_SUFFIX"), { ordinal: ordinal(t, combatant.strikesMade) })}
                </span>
              </div>

              <div style={{ marginTop: "12px", display: "flex", flexDirection: "column", gap: "3px", fontFamily: "var(--font-mono)", fontSize: "12.5px" }}>
                {resolution.ledger.applied.map((m) => (
                  <div key={m.source} style={{ display: "flex", gap: "10px", padding: "4px 0" }} title={`${m.source}: ${formatSigned(m.value)}`}>
                    {/* The Strike's own bonus is the base the others move: it
                        stays ink. Every other line is a bonus (green) or a
                        malus (red). */}
                    <span style={{ width: "46px", textAlign: "right", fontWeight: 600, color: m.source === ATTACK_BONUS_SOURCE ? undefined : deltaColor(m.value) }}>{formatSigned(m.value)}</span>
                    <span style={{ color: "var(--text-dim)" }}>{m.source}</span>
                  </div>
                ))}
                {resolution.ledger.suppressed.map((m) => (
                  <div key={m.source} style={{ display: "flex", gap: "10px", padding: "4px 0" }} title={`${m.source}: ${formatSigned(m.value)}${t("SUPPRESSED_TITLE_SUFFIX")}`}>
                    <span style={{ width: "46px", textAlign: "right", color: "var(--text-faint)" }}>{formatSigned(m.value)}</span>
                    <span style={{ color: "var(--text-faint)" }}>
                      {m.source} {t("SUPPRESSED_PENALTY_SUFFIX")}
                    </span>
                  </div>
                ))}
                <div style={{ display: "flex", gap: "10px", padding: "7px 0 0", marginTop: "3px", borderTop: "1px solid var(--border)", color: "var(--text)", fontSize: "15px" }} {...hover(modifiersHover(`${t("TOTAL_ATTACK_MODIFIER")} ${formatSigned(resolution.modifier)}`, resolution.ledger.applied))}>
                  <span style={{ width: "46px", textAlign: "right", fontWeight: 600, color: deltaColor(resolution.modifier - attack.bonus) }}>{formatSigned(resolution.modifier)}</span>
                  <span style={{ fontSize: "12.5px", alignSelf: "center", color: "var(--text-dim)" }}>{t("TOTAL_ATTACK_MODIFIER")}</span>
                </div>
              </div>

              <div style={{ marginTop: "14px", padding: "13px 15px", borderRadius: "4px", background: "var(--bg)", border: "1px solid var(--border-strong)" }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: "10px" }}>
                  <span style={{ fontSize: "11px", letterSpacing: "0.08em", color: "var(--text-faint)" }}>{t("ROLL_LABEL")}</span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: "26px", fontWeight: 600, color: deltaColor(resolution.modifier - attack.bonus) ?? "var(--text)" }}>{rollLine}</span>
                  <span
                    style={{ fontSize: "12px", color: deltaColor(resolution.effectiveAc - target.ac!) ?? "var(--text-faint)" }}
                    {...hover(modifiersHover(format(t("VS_AC_TEMPLATE"), { ac: resolution.effectiveAc }), resolution.acLedger.applied) ?? t("BASE_AC_TOOLTIP"))}
                  >
                    {format(t("VS_AC_TEMPLATE"), { ac: resolution.effectiveAc })}
                  </span>
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "108px 84px 1fr",
                    alignItems: "center",
                    columnGap: "12px",
                    rowGap: "4px",
                    marginTop: "12px",
                  }}
                >
                  {(() => {
                    const ranges = degreeTotalRanges(resolution.modifier, resolution.effectiveAc);
                    const rangeByDegree = new Map(ranges.map((r) => [r.degree, r]));
                    const natOne = 1 + resolution.modifier;
                    const natTwenty = 20 + resolution.modifier;
                    return resolution.outcomes.map((o) => {
                      const r = rangeByDegree.get(o.degree)!;
                      return (
                        <div
                          key={o.degree}
                          data-testid={`outcome-${o.degree}`}
                          style={{ display: "contents" }}
                        >
                          <span style={{ background: "var(--panel-raised)", fontSize: "13px", fontWeight: 600, padding: "8px 0 8px 11px" }}>
                            {t(DEGREE_LABEL_KEY[o.degree])}
                          </span>
                          <span style={{ background: "var(--panel-raised)", fontFamily: "var(--font-mono)", fontSize: "17px", fontWeight: 600, padding: "8px 0" }}>
                            <RangeCell low={r.low} high={r.high} natOne={natOne} natTwenty={natTwenty} />
                          </span>
                          <span style={{ background: "var(--panel-raised)", fontFamily: "var(--font-mono)", fontSize: "13px", color: "var(--text-dim)", padding: "8px 11px 8px 0" }}>
                            <span style={{ color: o.damage ? deltaColor(resolution.damageLedger.total) : undefined }}>{o.damage ?? t("NO_DAMAGE")}</span>
                          </span>
                        </div>
                      );
                    });
                  })()}
                </div>

                <button
                  type="button"
                  onClick={() => {
                    recordStrike(combatant.id);
                    // A Strike is always a 1-action activity.
                    spendActions(combatant.id, 1);
                  }}
                  style={{
                    marginTop: "12px",
                    fontFamily: "inherit",
                    fontSize: "13px",
                    fontWeight: 600,
                    padding: "9px 16px",
                    borderRadius: "4px",
                    border: "1px solid var(--border-strong)",
                    background: "var(--select)",
                    color: "var(--select-text)",
                    cursor: "pointer",
                  }}
                >
                  {t("RECORD_STRIKE_BUTTON")}
                </button>
              </div>
            </div>
          );
        })()
      )}
    </div>
  );
}
