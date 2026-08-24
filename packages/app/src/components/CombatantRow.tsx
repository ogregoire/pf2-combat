import { useEffect, useRef, useState } from "react";
import { useEncounter } from "../state/store.js";
import { CONDITIONS } from "../rules/conditions.js";
import { RowPopover } from "./RowPopover.js";
import type { Combatant } from "../state/types.js";

const HP_TRACK = "oklch(0.28 0.02 30)";
const GROUP_BG = "oklch(0.205 0.014 200)";

function hpColor(current: number, max: number): string {
  if (max <= 0) return "var(--text-faint)";
  const ratio = current / max;
  if (ratio >= 1) return "var(--ok)";
  if (ratio <= 0.25) return "var(--danger)";
  return "var(--accent)";
}

function conditionLabel(slug: Combatant["conditions"][number]["slug"], value: number): string {
  const def = CONDITIONS[slug];
  return def.valued ? `${def.name.toUpperCase()} ${value}` : def.name.toUpperCase();
}

function ConditionChips({ combatant }: { combatant: Combatant }): React.ReactElement | null {
  if (combatant.conditions.length === 0) return null;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", marginTop: "5px" }}>
      {combatant.conditions.map((c) => (
        <span
          key={c.slug}
          style={{
            fontSize: "10px",
            letterSpacing: "0.04em",
            padding: "1px 5px",
            borderRadius: "2px",
            background: "var(--cond-bg)",
            color: "var(--cond)",
          }}
        >
          {conditionLabel(c.slug, c.value)}
        </span>
      ))}
    </div>
  );
}

function HpBar({
  current,
  max,
  width,
  height = 5,
}: {
  current: number;
  max: number;
  width: string;
  height?: number;
}): React.ReactElement {
  const pct = max > 0 ? Math.min(100, Math.max(0, (current / max) * 100)) : 0;
  return (
    <div style={{ width, height: `${height}px`, borderRadius: "3px", background: HP_TRACK, overflow: "hidden", flexShrink: 0 }}>
      <div style={{ width: `${pct}%`, height: "100%", background: hpColor(current, max) }} />
    </div>
  );
}

function levelLabel(combatant: Combatant): string {
  return combatant.kind === "pc" ? `PC ${combatant.level}` : `${combatant.level}`;
}

/** Standalone anatomy (ungrouped combatants and PCs): initiative, name, HP
 * bar with current/max, AC + the three saves right-aligned in mono,
 * condition chips beneath. Matches Main.dc.html's non-grouped rows. */
function StandaloneRow({
  combatant,
  initiative,
}: {
  combatant: Combatant;
  initiative?: number;
}): React.ReactElement {
  const borderColor = combatant.kind === "pc" ? "oklch(0.55 0.10 240)" : "oklch(0.38 0.015 60)";

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "10px",
        padding: "8px 10px",
        borderRadius: "4px",
        borderLeft: `3px solid ${borderColor}`,
        background: "var(--panel-raised)",
        opacity: combatant.defeated ? 0.42 : 1,
      }}
    >
      {initiative !== undefined && (
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "17px",
            fontWeight: 600,
            width: "24px",
            textAlign: "right",
            color: "var(--text-dim)",
          }}
        >
          {initiative}
        </div>
      )}

      <div style={{ flexGrow: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: "6px" }}>
          <span style={{ fontWeight: 500, textDecoration: combatant.defeated ? "line-through" : "none" }}>
            {combatant.name}
          </span>
          <span style={{ fontSize: "11px", color: "var(--text-faint)" }}>{levelLabel(combatant)}</span>
        </div>

        {!combatant.defeated && combatant.hp !== null && (
          <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "5px" }}>
            <HpBar current={combatant.hp.current} max={combatant.hp.max} width="100%" />
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "11px", color: "var(--text-dim)" }}>
              {combatant.hp.current}/{combatant.hp.max}
            </span>
          </div>
        )}

        {!combatant.defeated && <ConditionChips combatant={combatant} />}
      </div>

      {combatant.defeated ? (
        <span style={{ fontSize: "9.5px", letterSpacing: "0.06em", color: "var(--text-faint)" }}>DEFEATED</span>
      ) : (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-end",
            gap: "2px",
            fontFamily: "var(--font-mono)",
            fontSize: "11px",
          }}
        >
          <span style={{ color: "var(--text)" }}>{combatant.ac !== null ? `AC ${combatant.ac}` : "—"}</span>
          <span style={{ color: "var(--text-faint)", letterSpacing: "-0.01em" }}>
            {combatant.saves !== null
              ? `${combatant.saves.fortitude} / ${combatant.saves.reflex} / ${combatant.saves.will}`
              : "—"}
          </span>
        </div>
      )}
    </div>
  );
}

/** Grouped-member anatomy, matching Main.dc.html's indented group rows: the
 * HP bar beside the name (not stacked below it), and AC only — no saves;
 * those only fit next to a standalone row's stacked initiative/AC column,
 * and the mockup omits them for members. No per-row initiative either —
 * it's shared on the GroupHeader. The left border in the group's colour
 * belongs to the group wrapper (CombatantList.tsx), not each member row —
 * the mockup only draws it once. */
function GroupMemberRow({ combatant }: { combatant: Combatant }): React.ReactElement {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "9px",
        padding: "7px 10px",
        borderRadius: "3px",
        background: GROUP_BG,
        opacity: combatant.defeated ? 0.42 : 1,
      }}
    >
      <div style={{ flexGrow: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: "5px" }}>
          <span style={{ fontSize: "13px", fontWeight: 500, textDecoration: combatant.defeated ? "line-through" : "none" }}>
            {combatant.name}
          </span>
          <span style={{ fontSize: "10.5px", color: "var(--text-faint)" }}>{levelLabel(combatant)}</span>
        </div>
        {!combatant.defeated && <ConditionChips combatant={combatant} />}
      </div>

      {combatant.defeated ? (
        <span style={{ fontSize: "9.5px", letterSpacing: "0.06em", color: "var(--text-faint)" }}>DEFEATED</span>
      ) : (
        <>
          {combatant.hp !== null && (
            <>
              <HpBar current={combatant.hp.current} max={combatant.hp.max} width="46px" height={4} />
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "11px",
                  color: "var(--text-dim)",
                  width: "42px",
                  textAlign: "right",
                }}
              >
                {combatant.hp.current}/{combatant.hp.max}
              </span>
            </>
          )}
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "11px",
              color: "var(--text-faint)",
              width: "34px",
              textAlign: "right",
            }}
          >
            {combatant.ac !== null ? `AC ${combatant.ac}` : "—"}
          </span>
        </>
      )}
    </div>
  );
}

/** Wraps a combatant's row together with its hover-triggered damage
 * popover. `grouped` selects the compact group-member anatomy over the
 * full standalone one; `initiative` (standalone rows only) shows the
 * per-row initiative — group members share theirs on the GroupHeader. */
export function CombatantRow({
  id,
  initiative,
  grouped = false,
}: {
  id: string;
  initiative?: number;
  grouped?: boolean;
}): React.ReactElement | null {
  const [hovered, setHovered] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const combatant = useEncounter((s) => s.encounter.combatants[id]);

  useEffect(() => () => {
    if (closeTimer.current !== null) clearTimeout(closeTimer.current);
  }, []);

  if (!combatant) return null;

  // The pointer moving from the row's name onto a control inside the
  // popover is a single continuous hover as far as the user is concerned,
  // but jsdom/user-event synthesizes mouseout/mouseover without a
  // relatedTarget, so React's own mouseenter/mouseleave plugin can't tell
  // the pointer stayed inside — it briefly fires a leave. Deferring the
  // close by a tick and cancelling it on the immediately-following re-entry
  // absorbs that without adding any perceptible delay for a real pointer.
  const openPopover = (): void => {
    if (closeTimer.current !== null) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
    setHovered(true);
  };

  const scheduleClose = (): void => {
    closeTimer.current = setTimeout(() => setHovered(false), 0);
  };

  return (
    <div style={{ position: "relative" }} onMouseEnter={openPopover} onMouseLeave={scheduleClose}>
      {grouped ? (
        <GroupMemberRow combatant={combatant} />
      ) : (
        <StandaloneRow combatant={combatant} initiative={initiative} />
      )}

      {hovered && <RowPopover combatantId={id} />}
    </div>
  );
}
