import { useEffect, useRef, useState } from "react";
import { resolveCreatureName } from "../data/i18nOverlay.js";
import { useEncounter } from "../state/store.js";
import { format, useT, type StringKey } from "../i18n/index.js";
import { AdjustmentBadge } from "./AdjustmentBadge.js";
import { ConditionChips } from "./DefenseSummary.js";
import { SustainChips } from "./SustainChips.js";
import { RowPopover } from "./RowPopover.js";
import { useCombatantI18n } from "../hooks/useCombatantI18n.js";
import { NARROW_LAYOUT_QUERY, useMediaQuery } from "../hooks/useMediaQuery.js";
import type { Combatant } from "../state/types.js";

/** What CombatantList hands a row that stands for an entry in the order:
 * the native drag/drop handlers to spread on the row (`draggable` present
 * only when the entry may actually be picked up), and whether the row is
 * the one currently being dragged — in which case it hides, and the list
 * shows an empty slot where it would land. */
export interface RowDrag {
  props: React.HTMLAttributes<HTMLDivElement> & { draggable?: boolean };
  hidden: boolean;
}

const GROUP_BG = "var(--info-bg)";
// Deliberately not the gold --turn hue (ACTIVE_* below) — the GM must tell "active" and "targeted" apart at a
// glance, and they are frequently different combatants.
const TARGET_RING = "var(--target)";

// The active-row treatment, in the --turn gold from tokens.css: gold
// border-left, a gold-tinted background, a thin ring, and a gold initiative
// number (vs the muted var(--text-dim)).
const ACTIVE_BORDER = "var(--turn)";
const ACTIVE_BG = "var(--turn-bg)";
const ACTIVE_RING = "0 0 0 1px var(--turn-ring)";
const ACTIVE_INITIATIVE_COLOR = "var(--turn-text)";

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

/** On a narrow screen there's no hover, so the row's tap is the only way
 * into its popover: the row becomes a disclosure control (aria-expanded).
 * On desktop the popover opens on hover and the row itself does nothing on
 * click — targeting lives in the roll assistant's target picker, not here. */
function rowProps(
  displayName: string,
  narrow: boolean,
  open: boolean,
  onTap: () => void,
  t: (key: StringKey) => string,
): React.HTMLAttributes<HTMLDivElement> {
  // Not interactive on desktop, but still named, so assistive tech (and
  // tests) can tell one row from another.
  if (!narrow) return { role: "group", "aria-label": displayName };
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

/** The multi-select checkbox that feeds CombatantList's group builder.
 * Rendered inside the row, which opens its popover on tap when narrow, so
 * its own click must not bubble up and open the popover too. */
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

/** The drag handle — the only place a drag can start from. The whole row
 * is still the `draggable` element (so the browser's drag image is the
 * row, not this glyph); CombatantList cancels any dragstart whose
 * mousedown did not land on a `data-drag-handle`. `cursor: grab` lives
 * here rather than on the row, so only the grip reads as draggable.
 *
 * `enabled: false` hides the glyph but keeps its box, so a row that can't
 * be dragged (an unrolled one — see `canDrag`) doesn't pull its initiative
 * and name a column's width to the left of every other row in the list. */
export function DragGrip({ enabled }: { enabled: boolean }): React.ReactElement {
  return (
    <span
      aria-hidden="true"
      data-drag-handle={enabled ? "" : undefined}
      // A tap here must not reach the row's tap-to-open (narrow).
      onClick={(e) => e.stopPropagation()}
      style={{
        flexShrink: 0,
        cursor: enabled ? "grab" : "default",
        color: "var(--text-faint)",
        fontSize: "13px",
        lineHeight: 1,
        visibility: enabled ? "visible" : "hidden",
      }}
    >
      ⠿
    </span>
  );
}

function levelLabel(combatant: Combatant, t: (key: StringKey) => string): string {
  return combatant.kind === "pc" ? `${t("PC_PREFIX")} ${combatant.level}` : `${combatant.level}`;
}

/** Standalone anatomy (ungrouped combatants and PCs): initiative, name and
 * level, condition chips beneath. The list says whose turn it is and in what
 * order; HP, AC and saves are the defensive side and live in the roll
 * assistant's target picker (DefenseSummary), not here. */
function StandaloneRow({
  combatant,
  initiative,
  delayed,
  initiativeBeforeDelay,
  active,
  targeted,
  narrow,
  open,
  onTap,
  selected,
  onToggleSelect,
  drag,
}: {
  combatant: Combatant;
  initiative?: number | null;
  delayed: boolean;
  initiativeBeforeDelay: number | null;
  active: boolean;
  targeted: boolean;
  narrow: boolean;
  open: boolean;
  onTap: () => void;
  selected: boolean;
  onToggleSelect: () => void;
  drag?: RowDrag;
}): React.ReactElement {
  const t = useT();
  const lang = useEncounter((s) => s.lang);
  const i18n = useCombatantI18n(combatant);
  const displayName = resolveCreatureName(combatant.name, i18n, lang);
  const borderColor = active
    ? ACTIVE_BORDER
    : combatant.kind === "pc"
      ? "var(--pc)"
      : "var(--border-strong)";

  // Dragging is desktop-only in practice (jsdom/touch don't drive native
  // HTML5 drag), and only offered once the caller (CombatantList) has
  // handed down the entry's drag wiring — grouped members never get it, so
  // they're simply not draggable. The list owns the whole gesture (what is
  // being dragged, where the empty slot sits, whether a slot is legal);
  // this row only spreads the handlers it is given.
  const inTheOrder = drag !== undefined;
  const canDrag = inTheOrder && drag.props.draggable === true;

  return (
    <div
      {...rowProps(displayName, narrow, open, onTap, t)}
      {...(drag?.props ?? {})}
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
        cursor: narrow ? "pointer" : "default",
      }}
    >
      <SelectCheckbox name={displayName} checked={selected} onToggle={onToggleSelect} />
      {inTheOrder && <DragGrip enabled={canDrag} />}

      {initiative !== undefined && (
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "17px",
            fontWeight: 600,
            width: "24px",
            textAlign: "right",
            color: active ? ACTIVE_INITIATIVE_COLOR : "var(--text-dim)",
            // A Delayed combatant holds no position in the order at all
            // (Player Core p. 416), so the number it is parked on is struck
            // out rather than shown as a live slot. The "delayed" tag beside
            // it is what keeps this from reading as the defeated styling,
            // which strikes the name through in the same way.
            textDecoration: delayed ? "line-through" : "none",
          }}
        >
          {initiative === null ? "—" : initiative}
        </div>
      )}

      {delayed && (
        <span style={{ fontSize: "10px", letterSpacing: "0.06em", color: "var(--info)" }}>{t("DELAYED_LABEL")}</span>
      )}

      {/* Returning permanently rewrites the initiative, so the old value
         survives only as this record of where the combatant used to act. */}
      {!delayed && initiativeBeforeDelay !== null && (
        <span style={{ fontSize: "11px", color: "var(--text-faint)", textDecoration: "line-through" }}>
          {initiativeBeforeDelay}
        </span>
      )}

      <div style={{ flexGrow: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: "6px" }}>
          <span style={{ fontWeight: 500, textDecoration: combatant.defeated ? "line-through" : "none" }}>
            {displayName}
          </span>
          <span style={{ fontSize: "11px", color: "var(--text-faint)" }}>{levelLabel(combatant, t)}</span>
          <AdjustmentBadge combatant={combatant} />
        </div>

        {!combatant.defeated && <ConditionChips combatant={combatant} />}
        {!combatant.defeated && <SustainChips combatant={combatant} />}
      </div>

      {combatant.defeated && (
        <span style={{ fontSize: "9.5px", letterSpacing: "0.06em", color: "var(--text-faint)" }}>{t("DEFEATED_BADGE")}</span>
      )}
    </div>
  );
}

/** Grouped-member anatomy, matching Main.dc.html's indented group rows: name,
 * level and conditions, like a standalone row but with no per-row initiative
 * — it's shared on the GroupHeader. The left border in the group's colour
 * belongs to the group wrapper (CombatantList.tsx), not each member row —
 * the mockup only draws it once. */
function GroupMemberRow({
  combatant,
  active,
  targeted,
  narrow,
  open,
  onTap,
  selected,
  onToggleSelect,
}: {
  combatant: Combatant;
  active: boolean;
  targeted: boolean;
  narrow: boolean;
  open: boolean;
  onTap: () => void;
  selected: boolean;
  onToggleSelect: () => void;
}): React.ReactElement {
  const t = useT();
  const lang = useEncounter((s) => s.lang);
  const i18n = useCombatantI18n(combatant);
  const displayName = resolveCreatureName(combatant.name, i18n, lang);
  return (
    <div
      {...rowProps(displayName, narrow, open, onTap, t)}
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
        cursor: narrow ? "pointer" : "default",
      }}
    >
      <SelectCheckbox name={displayName} checked={selected} onToggle={onToggleSelect} />

      <div style={{ flexGrow: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: "5px" }}>
          <span style={{ fontSize: "13px", fontWeight: 500, textDecoration: combatant.defeated ? "line-through" : "none" }}>
            {displayName}
          </span>
          <span style={{ fontSize: "10.5px", color: "var(--text-faint)" }}>{levelLabel(combatant, t)}</span>
          <AdjustmentBadge combatant={combatant} />
        </div>
        {!combatant.defeated && <ConditionChips combatant={combatant} />}
        {!combatant.defeated && <SustainChips combatant={combatant} />}
      </div>

      {combatant.defeated && (
        <span style={{ fontSize: "9.5px", letterSpacing: "0.06em", color: "var(--text-faint)" }}>{t("DEFEATED_BADGE")}</span>
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
  delayed = false,
  initiativeBeforeDelay = null,
  grouped = false,
  active = false,
  selected = false,
  onToggleSelect,
  drag,
}: {
  id: string;
  initiative?: number | null;
  /** Both describe the row's *entry*, not the combatant, and default to the
   * un-delayed state so the group-member anatomy and any caller that doesn't
   * track entries can keep passing nothing. */
  delayed?: boolean;
  initiativeBeforeDelay?: number | null;
  grouped?: boolean;
  active?: boolean;
  /** Multi-select for the group builder (CombatantList) — defaults are a
   * safe no-op so existing callers (tests, future call sites) that don't
   * care about grouping don't have to pass anything. */
  selected?: boolean;
  onToggleSelect?: () => void;
  /** The drag wiring for the entry this row stands for — omitted for a
   * grouped member, which has no entry of its own and so can't be dragged
   * or dropped on. CombatantList builds it, and owns the whole gesture. */
  drag?: RowDrag;
}): React.ReactElement | null {
  const [hovered, setHovered] = useState(false);
  const [tapOpen, setTapOpen] = useState(false);
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const combatant = useEncounter((s) => s.encounter.combatants[id]);
  const targetId = useEncounter((s) => s.encounter.targetId);
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

  // Targeting is chosen in the roll assistant's target picker; the row only
  // shows the ring, so the GM can still find the target in the order.
  const targeted = targetId === id;

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
    <div
      ref={wrapperRef}
      // While this very row is being dragged, the list shows an empty slot
      // in its place; the wrapper leaves the flow entirely, or it would
      // still claim one of the list's gaps and nudge every row below.
      style={{ position: "relative", display: drag?.hidden ? "none" : undefined }}
      onMouseEnter={openPopover}
      onMouseLeave={scheduleClose}
    >
      {grouped ? (
        <GroupMemberRow
          combatant={combatant}
          active={active}
          targeted={targeted}
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
          delayed={delayed}
          initiativeBeforeDelay={initiativeBeforeDelay}
          active={active}
          targeted={targeted}
          narrow={narrow}
          open={tapOpen}
          onTap={onTap}
          selected={selected}
          onToggleSelect={onToggleSelect ?? (() => {})}
          drag={drag}
        />
      )}

      {popoverVisible && (
        <RowPopover
          combatantId={id}
          narrow={narrow}
          anchor={anchor}
          onClose={closeTapPopover}
        />
      )}
    </div>
  );
}
