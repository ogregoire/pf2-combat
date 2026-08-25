import { useEffect, useRef, useState } from "react";
import { resolveCreatureName } from "../data/i18nOverlay.js";
import { useEncounter } from "../state/store.js";
import { format, useT, type StringKey } from "../i18n/index.js";
import { CONDITIONS } from "../rules/conditions.js";
import { conditionDisplayName, type TraitInfo } from "../rules/traitInfo.js";
import { RowPopover } from "./RowPopover.js";
import { useTraitGlossary } from "../hooks/useTraitGlossary.js";
import { NARROW_LAYOUT_QUERY, useMediaQuery } from "../hooks/useMediaQuery.js";
import type { Combatant } from "../state/types.js";

const HP_TRACK = "oklch(0.28 0.02 30)";
const GROUP_BG = "oklch(0.205 0.014 200)";
// Deliberately not the ember/accent hue Main.dc.html uses for "whose turn it
// is" (ACTIVE_* below) — the GM must tell "active" and "targeted" apart at a
// glance, and they are frequently different combatants.
const TARGET_RING = "oklch(0.80 0.15 95)";

// Main.dc.html's active-row treatment: ember border-left, a warmer panel
// background, a thin ring, and a warmer initiative colour (vs the muted
// var(--text-dim), which is oklch(0.72 0.012 75)).
const ACTIVE_BORDER = "oklch(0.70 0.15 55)";
const ACTIVE_BG = "oklch(0.27 0.030 55)";
const ACTIVE_RING = "0 0 0 1px oklch(0.44 0.08 55)";
const ACTIVE_INITIATIVE_COLOR = "oklch(0.86 0.12 60)";

/** Layers the active-entry ring and the target ring as two concentric
 * shadows rather than letting one replace the other, so a combatant that is
 * both active and targeted — a creature can target itself, or the GM may
 * attack the active creature with a readied action — shows both at once. */
function combinedRing(active: boolean, targeted: boolean): string {
  const layers: string[] = [];
  if (active) layers.push(ACTIVE_RING);
  if (targeted) layers.push(`0 0 0 3px ${TARGET_RING}`);
  return layers.length > 0 ? layers.join(", ") : "none";
}

/** Handles both the click-to-target toggle and Enter/Space activation, since
 * every row is now a keyboard-reachable target picker, not a bare div — on
 * desktop. On a narrow screen the row's tap instead opens the popover
 * (`onTap`): there's no hover there, so tapping is the only way in, and the
 * row's click can't do both jobs at once. Targeting moves into an explicit
 * "Target" control inside the popover (RowPopover) in that case, which is
 * why this becomes a disclosure control (aria-expanded) rather than a
 * pressed toggle (aria-pressed) when narrow. */
function targetRowProps(
  displayName: string,
  targeted: boolean,
  onToggleTarget: () => void,
  narrow: boolean,
  open: boolean,
  onTap: () => void,
  t: (key: StringKey) => string,
): {
  role: "button";
  tabIndex: number;
  "aria-pressed"?: boolean;
  "aria-expanded"?: boolean;
  "aria-label": string;
  onClick: () => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
} {
  if (narrow) {
    return {
      role: "button",
      tabIndex: 0,
      "aria-expanded": open,
      "aria-label": format(t("SHOW_ACTIONS_ARIA"), { name: displayName }),
      onClick: onTap,
      onKeyDown: (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onTap();
        }
      },
    };
  }
  return {
    role: "button",
    tabIndex: 0,
    "aria-pressed": targeted,
    "aria-label": format(t("TARGET_NAME_ARIA"), { name: displayName }),
    onClick: onToggleTarget,
    onKeyDown: (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onToggleTarget();
      }
    },
  };
}

/** The multi-select checkbox that feeds CombatantList's group builder.
 * Rendered inside the row's own click-to-target div, so its own click (and
 * the label click that would otherwise re-trigger it) must not bubble up
 * and toggle the target instead. */
function SelectCheckbox({
  name,
  checked,
  onToggle,
}: {
  name: string;
  checked: boolean;
  onToggle: () => void;
}): React.ReactElement {
  const t = useT();
  return (
    <input
      type="checkbox"
      aria-label={format(t("SELECT_FOR_GROUPING_ARIA"), { name })}
      checked={checked}
      onChange={onToggle}
      onClick={(e) => e.stopPropagation()}
      style={{ flexShrink: 0, width: "14px", height: "14px", cursor: "pointer" }}
    />
  );
}

function hpColor(current: number, max: number): string {
  if (max <= 0) return "var(--text-faint)";
  const ratio = current / max;
  if (ratio >= 1) return "var(--ok)";
  if (ratio <= 0.25) return "var(--danger)";
  return "var(--accent)";
}

function conditionLabel(
  slug: Combatant["conditions"][number]["slug"],
  value: number,
  glossary: Map<string, TraitInfo>,
  lang: "en" | "fr",
): string {
  const def = CONDITIONS[slug];
  const name = conditionDisplayName(slug, glossary, lang);
  return def.valued ? `${name.toUpperCase()} ${value}` : name.toUpperCase();
}

/** Same French condition name RowPopover's own picker/chip resolve
 * (`conditionDisplayName`, shared via rules/traitInfo.js) — otherwise a
 * combatant could show "FRIGHTENED 2" here and "EFFRAYÉ 2" the moment its
 * popover opens, two languages for the one applied condition at once. */
function ConditionChips({ combatant }: { combatant: Combatant }): React.ReactElement | null {
  const lang = useEncounter((s) => s.lang);
  const glossary = useTraitGlossary();
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
          {conditionLabel(c.slug, c.value, glossary, lang)}
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
  /** Fixed width, per Main.dc.html's grouped-member bars (`width: 46px`).
   * Omit it to grow and fill the row instead, per Main.dc.html's
   * standalone-row bar (`flex-grow: 1`) — the bar yields space to the
   * `{current}/{max}` number beside it rather than demanding the full
   * line and shoving that number into the AC/saves column. */
  width?: string;
  height?: number;
}): React.ReactElement {
  const pct = max > 0 ? Math.min(100, Math.max(0, (current / max) * 100)) : 0;
  const sizing =
    width !== undefined ? { width, flexShrink: 0 } : { flexGrow: 1, flexShrink: 1, minWidth: 0 };
  return (
    <div style={{ ...sizing, height: `${height}px`, borderRadius: "3px", background: HP_TRACK, overflow: "hidden" }}>
      <div style={{ width: `${pct}%`, height: "100%", background: hpColor(current, max) }} />
    </div>
  );
}

function levelLabel(combatant: Combatant, t: (key: StringKey) => string): string {
  return combatant.kind === "pc" ? `${t("PC_PREFIX")} ${combatant.level}` : `${combatant.level}`;
}

const SAVE_NAME_KEYS = { F: "LABEL_FORTITUDE", R: "LABEL_REFLEX", W: "LABEL_WILL" } as const;

/** Programmatic, not a concatenated literal "+", so a zero or negative save
 * (none exist in the dataset today, but nothing here should assume that
 * stays true) still renders correctly. */
function formatSigned(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`;
}

/** One "F +6" unit: `title` names the save on hover (works without any JS
 * state, per the brief) and `aria-label` gives it an accessible name that
 * includes the signed value too, for anyone relying on a screen reader
 * instead of hover. The letter is bold, the value regular weight, with a
 * tight gap between them (not a full word space) so the pair reads as one
 * unit rather than two words. */
function SaveUnit({ letter, value }: { letter: keyof typeof SAVE_NAME_KEYS; value: number }): React.ReactElement {
  const t = useT();
  const saveName = t(SAVE_NAME_KEYS[letter]);
  return (
    <span title={saveName} aria-label={`${saveName} ${formatSigned(value)}`} style={{ whiteSpace: "nowrap" }}>
      <span style={{ fontWeight: 700 }}>{letter}</span>
      <span style={{ marginLeft: "2px" }}>{formatSigned(value)}</span>
    </span>
  );
}

/** ", " (a real comma, then a space) between units — not flex gap, which
 * only spaces them apart without the comma the brief asked for. */
function Saves({ saves }: { saves: Combatant["saves"] }): React.ReactElement {
  if (saves === null) return <span>—</span>;
  return (
    <span style={{ whiteSpace: "nowrap" }}>
      <SaveUnit letter="F" value={saves.fortitude} />
      {", "}
      <SaveUnit letter="R" value={saves.reflex} />
      {", "}
      <SaveUnit letter="W" value={saves.will} />
    </span>
  );
}

/** Standalone anatomy (ungrouped combatants and PCs): initiative, name, HP
 * bar with current/max, AC + the three saves right-aligned in mono,
 * condition chips beneath. Matches Main.dc.html's non-grouped rows. */
function StandaloneRow({
  combatant,
  initiative,
  active,
  targeted,
  onToggleTarget,
  narrow,
  open,
  onTap,
  selected,
  onToggleSelect,
}: {
  combatant: Combatant;
  initiative?: number;
  active: boolean;
  targeted: boolean;
  onToggleTarget: () => void;
  narrow: boolean;
  open: boolean;
  onTap: () => void;
  selected: boolean;
  onToggleSelect: () => void;
}): React.ReactElement {
  const t = useT();
  const lang = useEncounter((s) => s.lang);
  const displayName = resolveCreatureName(combatant.name, combatant.i18n, lang);
  const borderColor = active
    ? ACTIVE_BORDER
    : combatant.kind === "pc"
      ? "oklch(0.55 0.10 240)"
      : "oklch(0.38 0.015 60)";

  return (
    <div
      {...targetRowProps(displayName, targeted, onToggleTarget, narrow, open, onTap, t)}
      data-active={active}
      data-targeted={targeted}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "10px",
        padding: "8px 10px",
        borderRadius: "4px",
        borderLeft: `3px solid ${borderColor}`,
        background: active ? ACTIVE_BG : "var(--panel-raised)",
        opacity: combatant.defeated ? 0.42 : 1,
        boxShadow: combinedRing(active, targeted),
        cursor: "pointer",
      }}
    >
      <SelectCheckbox name={displayName} checked={selected} onToggle={onToggleSelect} />

      {initiative !== undefined && (
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "17px",
            fontWeight: 600,
            width: "24px",
            textAlign: "right",
            color: active ? ACTIVE_INITIATIVE_COLOR : "var(--text-dim)",
          }}
        >
          {initiative}
        </div>
      )}

      <div style={{ flexGrow: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: "6px" }}>
          <span style={{ fontWeight: 500, textDecoration: combatant.defeated ? "line-through" : "none" }}>
            {displayName}
          </span>
          <span style={{ fontSize: "11px", color: "var(--text-faint)" }}>{levelLabel(combatant, t)}</span>
        </div>

        {!combatant.defeated && combatant.hp !== null && (
          <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "5px" }}>
            <HpBar current={combatant.hp.current} max={combatant.hp.max} />
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "11px",
                color: "var(--text-dim)",
                flexShrink: 0,
                whiteSpace: "nowrap",
              }}
            >
              {combatant.hp.current}/{combatant.hp.max}
            </span>
          </div>
        )}

        {!combatant.defeated && <ConditionChips combatant={combatant} />}
      </div>

      {combatant.defeated ? (
        <span style={{ fontSize: "9.5px", letterSpacing: "0.06em", color: "var(--text-faint)" }}>{t("DEFEATED_BADGE")}</span>
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
          <span style={{ color: "var(--text)" }}>{combatant.ac !== null ? `${t("LABEL_AC")} ${combatant.ac}` : "—"}</span>
          <span style={{ color: "var(--text-faint)", letterSpacing: "-0.01em" }}>
            <Saves saves={combatant.saves} />
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
function GroupMemberRow({
  combatant,
  active,
  targeted,
  onToggleTarget,
  narrow,
  open,
  onTap,
  selected,
  onToggleSelect,
}: {
  combatant: Combatant;
  active: boolean;
  targeted: boolean;
  onToggleTarget: () => void;
  narrow: boolean;
  open: boolean;
  onTap: () => void;
  selected: boolean;
  onToggleSelect: () => void;
}): React.ReactElement {
  const t = useT();
  const lang = useEncounter((s) => s.lang);
  const displayName = resolveCreatureName(combatant.name, combatant.i18n, lang);
  return (
    <div
      {...targetRowProps(displayName, targeted, onToggleTarget, narrow, open, onTap, t)}
      data-active={active}
      data-targeted={targeted}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "9px",
        padding: "7px 10px",
        borderRadius: "3px",
        background: active ? ACTIVE_BG : GROUP_BG,
        opacity: combatant.defeated ? 0.42 : 1,
        boxShadow: combinedRing(active, targeted),
        cursor: "pointer",
      }}
    >
      <SelectCheckbox name={displayName} checked={selected} onToggle={onToggleSelect} />

      <div style={{ flexGrow: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: "5px" }}>
          <span style={{ fontSize: "13px", fontWeight: 500, textDecoration: combatant.defeated ? "line-through" : "none" }}>
            {displayName}
          </span>
          <span style={{ fontSize: "10.5px", color: "var(--text-faint)" }}>{levelLabel(combatant, t)}</span>
        </div>
        {!combatant.defeated && <ConditionChips combatant={combatant} />}
      </div>

      {combatant.defeated ? (
        <span style={{ fontSize: "9.5px", letterSpacing: "0.06em", color: "var(--text-faint)" }}>{t("DEFEATED_BADGE")}</span>
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
            {combatant.ac !== null ? `${t("LABEL_AC")} ${combatant.ac}` : "—"}
          </span>
        </>
      )}
    </div>
  );
}

/** Wraps a combatant's row together with its damage popover — hover-
 * triggered on desktop, tap-triggered on a narrow (<=900px) screen, since a
 * touch screen has no hover at all. `grouped` selects the compact
 * group-member anatomy over the full standalone one; `initiative`
 * (standalone rows only) shows the per-row initiative — group members share
 * theirs on the GroupHeader. */
export function CombatantRow({
  id,
  initiative,
  grouped = false,
  active = false,
  selected = false,
  onToggleSelect,
}: {
  id: string;
  initiative?: number;
  grouped?: boolean;
  active?: boolean;
  /** Multi-select for the group builder (CombatantList) — defaults are a
   * safe no-op so existing callers (tests, future call sites) that don't
   * care about grouping don't have to pass anything. */
  selected?: boolean;
  onToggleSelect?: () => void;
}): React.ReactElement | null {
  const [hovered, setHovered] = useState(false);
  const [tapOpen, setTapOpen] = useState(false);
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const combatant = useEncounter((s) => s.encounter.combatants[id]);
  const targetId = useEncounter((s) => s.encounter.targetId);
  const setTarget = useEncounter((s) => s.setTarget);
  const narrow = useMediaQuery(NARROW_LAYOUT_QUERY);

  useEffect(() => () => {
    if (closeTimer.current !== null) clearTimeout(closeTimer.current);
  }, []);

  // The desktop panel is fixed-positioned outside the scrolling list, so it
  // would stay put if the list scrolled or the window resized under an open
  // hover. Re-measure while it's open; capture-phase, since the list's own
  // scroll event doesn't bubble to window.
  useEffect(() => {
    if (!hovered || narrow) return undefined;
    const remeasure = (): void => {
      const rect = wrapperRef.current?.getBoundingClientRect();
      if (rect) setAnchor(rect);
    };
    window.addEventListener("scroll", remeasure, true);
    window.addEventListener("resize", remeasure);
    return () => {
      window.removeEventListener("scroll", remeasure, true);
      window.removeEventListener("resize", remeasure);
    };
  }, [hovered, narrow]);

  if (!combatant) return null;

  // mockups/TurnAssistant.dc.html: "click any combatant to retarget".
  // Clicking the current target again clears it, so the GM can deselect.
  // On desktop this is still the row's own click; on narrow the row's tap
  // opens the popover instead (below), so RowPopover exposes this same
  // toggle as an explicit "Target" control there.
  const targeted = targetId === id;
  const toggleTarget = (): void => setTarget(targeted ? null : id);

  // The pointer moving from the row's name onto a control inside the
  // popover is a single continuous hover as far as the user is concerned,
  // but jsdom/user-event synthesizes mouseout/mouseover without a
  // relatedTarget, so React's own mouseenter/mouseleave plugin can't tell
  // the pointer stayed inside — it briefly fires a leave. Deferring the
  // close by a tick and cancelling it on the immediately-following re-entry
  // absorbs that without adding any perceptible delay for a real pointer.
  // Desktop-only: narrow screens don't hover, so this never fires there.
  const measure = (): void => {
    const rect = wrapperRef.current?.getBoundingClientRect();
    if (rect) setAnchor(rect);
  };

  const openPopover = (): void => {
    if (closeTimer.current !== null) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
    measure();
    setHovered(true);
  };

  const scheduleClose = (): void => {
    closeTimer.current = setTimeout(() => setHovered(false), 0);
  };

  // Narrow-only: tapping the row opens the popover (never toggles it shut —
  // RowPopover's full-screen backdrop is what a tap "elsewhere" dismisses
  // against, per the brief; tapping the already-open popover's backdrop
  // just re-opens the same state).
  const onTap = (): void => setTapOpen(true);
  const closeTapPopover = (): void => setTapOpen(false);

  const popoverVisible = narrow ? tapOpen : hovered;

  return (
    <div ref={wrapperRef} style={{ position: "relative" }} onMouseEnter={openPopover} onMouseLeave={scheduleClose}>
      {grouped ? (
        <GroupMemberRow
          combatant={combatant}
          active={active}
          targeted={targeted}
          onToggleTarget={toggleTarget}
          narrow={narrow}
          open={tapOpen}
          onTap={onTap}
          selected={selected}
          onToggleSelect={onToggleSelect ?? (() => {})}
        />
      ) : (
        <StandaloneRow
          combatant={combatant}
          initiative={initiative}
          active={active}
          targeted={targeted}
          onToggleTarget={toggleTarget}
          narrow={narrow}
          open={tapOpen}
          onTap={onTap}
          selected={selected}
          onToggleSelect={onToggleSelect ?? (() => {})}
        />
      )}

      {popoverVisible && (
        <RowPopover
          combatantId={id}
          narrow={narrow}
          anchor={anchor}
          targeted={targeted}
          onToggleTarget={toggleTarget}
          onClose={closeTapPopover}
        />
      )}
    </div>
  );
}
