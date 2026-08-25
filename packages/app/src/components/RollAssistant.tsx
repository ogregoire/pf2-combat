import type { Attack } from "@pf2/schema";
import { degreeTotalRanges, type Degree } from "../rules/degrees.js";
import { resolveStrike } from "../rules/strike.js";
import { useEncounter } from "../state/store.js";
import type { Combatant } from "../state/types.js";

function formatSigned(n: number): string {
  return n >= 0 ? `+${n}` : `−${Math.abs(n)}`;
}

const DEGREE_LABEL: Record<Degree, string> = {
  "critical-success": "critical hit",
  success: "hit",
  failure: "miss",
  "critical-failure": "critical miss",
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

const ORDINAL = ["first", "second", "third", "fourth", "fifth"];

function ordinal(strikesMade: number): string {
  return ORDINAL[Math.min(strikesMade, ORDINAL.length - 1)]!;
}

/** TurnAssistant.dc.html's right column: target, modifier ledger, roll line
 * and the four-row outcome ladder — all read straight off `resolveStrike`,
 * never re-derived. With no target selected there's nothing to compute
 * against, so this prompts for one instead of rendering a broken assistant. */
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

  if (!target) {
    return (
      <div
        style={{
          padding: "14px 16px",
          borderRadius: "5px",
          background: "var(--panel-high)",
          border: "1px solid var(--border)",
          fontSize: "13px",
          color: "var(--text-dim)",
        }}
      >
        Select a target to compute rolls against.
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "10px",
          padding: "10px 14px",
          borderRadius: "5px",
          background: "var(--panel-raised)",
          border: "1px solid var(--border)",
        }}
      >
        <span style={{ fontSize: "10px", letterSpacing: "0.09em", color: "var(--text-faint)" }}>TARGET</span>
        <span style={{ fontSize: "14px", fontWeight: 600 }}>{target.name}</span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: "13px", color: "var(--accent-text)" }}>
          {target.ac !== null ? `AC ${target.ac}` : "AC unknown"}
        </span>
        <div style={{ flexGrow: 1 }} />
        <span style={{ fontSize: "11.5px", color: "var(--text-faint)" }}>click any combatant to retarget</span>
      </div>

      {!attack ? (
        <div style={{ padding: "14px 16px", borderRadius: "5px", background: "var(--panel-high)", border: "1px solid var(--border)", fontSize: "13px", color: "var(--text-dim)" }}>
          Select a Strike above to see the roll.
        </div>
      ) : target.ac === null ? (
        <div style={{ padding: "14px 16px", borderRadius: "5px", background: "var(--panel-high)", border: "1px solid var(--border)", fontSize: "13px", color: "var(--text-dim)" }}>
          {target.name}&rsquo;s AC is unknown, so no roll can be computed against them.
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
            targetAc: target.ac!,
            damage: attack.damage.map((d) => ({ formula: d.formula, type: d.type, category: d.category })),
            traits: attack.traits,
          });
          const rollLine = `1d20 ${resolution.modifier >= 0 ? "+" : "−"} ${Math.abs(resolution.modifier)}`;

          return (
            <div style={{ padding: "14px 16px", borderRadius: "5px", background: "var(--panel-high)", border: "1px solid var(--border-strong)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <span style={{ fontSize: "16px", fontWeight: 600 }}>{attack.name}</span>
                <span style={{ fontSize: "11px", color: "var(--text-faint)" }}>{ordinal(combatant.strikesMade)} Strike this turn</span>
              </div>

              <div style={{ marginTop: "12px", display: "flex", flexDirection: "column", gap: "3px", fontFamily: "var(--font-mono)", fontSize: "12.5px" }}>
                {resolution.ledger.applied.map((m) => (
                  <div key={m.source} style={{ display: "flex", gap: "10px", padding: "4px 0" }}>
                    <span style={{ width: "46px", textAlign: "right", fontWeight: 600 }}>{formatSigned(m.value)}</span>
                    <span style={{ color: "var(--text-dim)" }}>{m.source}</span>
                  </div>
                ))}
                {resolution.ledger.suppressed.map((m) => (
                  <div key={m.source} style={{ display: "flex", gap: "10px", padding: "4px 0" }}>
                    <span style={{ width: "46px", textAlign: "right", color: "var(--text-faint)" }}>{formatSigned(m.value)}</span>
                    <span style={{ color: "var(--text-faint)" }}>{m.source} — worse penalty already counted</span>
                  </div>
                ))}
                <div style={{ display: "flex", gap: "10px", padding: "7px 0 0", marginTop: "3px", borderTop: "1px solid var(--border)", color: "var(--accent-text)", fontSize: "15px" }}>
                  <span style={{ width: "46px", textAlign: "right", fontWeight: 600 }}>{formatSigned(resolution.modifier)}</span>
                  <span style={{ fontSize: "12.5px", alignSelf: "center", color: "var(--text-dim)" }}>total attack modifier</span>
                </div>
              </div>

              <div style={{ marginTop: "14px", padding: "13px 15px", borderRadius: "4px", background: "var(--bg)", border: "1px solid var(--border-strong)" }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: "10px" }}>
                  <span style={{ fontSize: "11px", letterSpacing: "0.08em", color: "var(--text-faint)" }}>ROLL</span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: "26px", fontWeight: 600, color: "var(--accent-text)" }}>{rollLine}</span>
                  <span style={{ fontSize: "12px", color: "var(--text-faint)" }}>vs AC {resolution.effectiveAc}</span>
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
                            {DEGREE_LABEL[o.degree]}
                          </span>
                          <span style={{ background: "var(--panel-raised)", fontFamily: "var(--font-mono)", fontSize: "17px", fontWeight: 600, padding: "8px 0" }}>
                            <RangeCell low={r.low} high={r.high} natOne={natOne} natTwenty={natTwenty} />
                          </span>
                          <span style={{ background: "var(--panel-raised)", fontFamily: "var(--font-mono)", fontSize: "13px", color: "var(--text-dim)", padding: "8px 11px 8px 0" }}>
                            {o.damage ?? "no damage"}
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
                    background: "var(--accent-bg)",
                    color: "var(--accent-text)",
                    cursor: "pointer",
                  }}
                >
                  Record strike
                </button>
              </div>
            </div>
          );
        })()
      )}
    </div>
  );
}
