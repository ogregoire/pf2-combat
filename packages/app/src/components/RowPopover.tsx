import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useEncounter } from "../state/store.js";
import { format, useT, type StringKey } from "../i18n/index.js";
import { useCombatantI18n } from "../hooks/useCombatantI18n.js";
import { useTraitGlossary } from "../hooks/useTraitGlossary.js";
import { conditionDisplayName } from "../rules/traitInfo.js";
import { resolveCreatureName } from "../data/i18nOverlay.js";
import { applyIwr, relevantDamageTypes, type Iwr } from "../rules/damage.js";
import { CONDITIONS, PICKABLE_CONDITIONS, type ConditionSlug } from "../rules/conditions.js";
import { DamageTypeIcon, damageTypeStyle } from "./damageTypes.js";
import { totalInitiative } from "../rules/initiative.js";

/**
 * One chip in the damage-type row. Each carries its own type's colour and
 * glyph (see damageTypes.tsx) rather than a shared grey, so the GM picks the
 * type by shape and hue instead of reading eight near-identical words.
 */
function DamageTypeButton({
  type,
  selected,
  onSelect,
  children,
}: {
  type: string;
  selected: boolean;
  onSelect: () => void;
  children: React.ReactNode;
}): React.ReactElement {
  const style = damageTypeStyle(type);
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      style={{
        fontFamily: "inherit",
        display: "inline-flex",
        alignItems: "center",
        gap: "5px",
        fontSize: "11.5px",
        fontWeight: selected ? 600 : 400,
        padding: "8px 10px", // bumped for a comfortable tap target on narrow screens
        borderRadius: "3px",
        cursor: "pointer",
        background: selected ? style.activeBg : "var(--bg)",
        border: `1px solid ${selected ? style.activeBorder : style.border}`,
        color: style.color,
      }}
    >
      <DamageTypeIcon type={type} />
      {children}
    </button>
  );
}

/** A plain, one-click "apply this condition" tag in the pickable row. No
 * dropdown — clicking it is the whole interaction (see applyCondition below
 * for what value it applies at). Per the GM's own spec ("Those that require
 * a number show `condition X`"), a valued condition shows a literal "X"
 * placeholder before it's applied, so the GM can tell at a glance which tags
 * take a number — that placeholder is what becomes the "− 1 +" stepper once
 * clicked. `aria-label` pins the accessible name to the bare condition name
 * regardless of that suffix, so existing exact-name queries (both tests and
 * any future ones) keep working. */
function PickableConditionButton({
  name,
  valued,
  onClick,
}: {
  name: string;
  valued: boolean;
  onClick: () => void;
}): React.ReactElement {
  return (
    <button
      type="button"
      aria-label={name}
      onClick={onClick}
      style={{
        fontFamily: "inherit",
        fontSize: "11.5px",
        padding: "7px 9px", // comfortable tap target — see the panel's own note on narrow screens
        borderRadius: "3px",
        cursor: "pointer",
        background: "var(--bg)",
        border: "1px solid var(--border-strong)",
        color: "var(--text)",
      }}
    >
      {name}
      {valued && (
        <>
          {" "}
          <span style={{ fontFamily: "var(--font-mono)", opacity: 0.55 }}>X</span>
        </>
      )}
    </button>
  );
}

/** The small +/- steppers on an applied valued condition's tag, and the
 * number between them. Kept tall enough to hit on a narrow screen — same
 * concern as PickableConditionButton's tap target, just narrower since
 * these live inside an already-crowded tag. */
function Stepper({
  name,
  value,
  onIncrease,
  onDecrease,
}: {
  name: string;
  value: number;
  onIncrease: () => void;
  onDecrease: () => void;
}): React.ReactElement {
  const buttonStyle: React.CSSProperties = {
    fontFamily: "inherit",
    fontSize: "12px",
    fontWeight: 600,
    lineHeight: 1,
    padding: "8px 10px", // measured in a real browser at 23x24px before this bump — well under the
    // ~37px tap target the panel's own Damage/Heal buttons use; jsdom can't catch an undersized
    // hit target, so this was only visible once actually rendered (see task-4-report.md).
    borderRadius: "3px",
    cursor: "pointer",
    background: "var(--panel-raised)",
    border: "1px solid var(--border-strong)",
    color: "var(--text)",
  };
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
      <button type="button" aria-label={`Decrease ${name}`} onClick={onDecrease} style={buttonStyle}>
        −
      </button>
      {/* The "small spaces around the number" the brief asks for. */}
      <span style={{ fontFamily: "var(--font-mono)", fontSize: "11.5px", padding: "0 2px" }}>{value}</span>
      <button type="button" aria-label={`Increase ${name}`} onClick={onIncrease} style={buttonStyle}>
        +
      </button>
    </span>
  );
}

/** Last damage/heal applied to this combatant, shown beside the HP line
 * until the next apply or the popover closes (component-local state, so
 * unmounting the popover — see CombatantRow — is what clears it). */
interface LastChange {
  delta: number; // negative for damage, positive for healing
  before: number;
  after: number;
  /** Set only when IWR changed the raw typed amount — explains the gap
   * between what the GM typed and what actually landed. */
  reason?: string;
}

/**
 * Describes why the applied amount differs from what the GM typed, e.g.
 * "30 cold, resistance 10". Mirrors applyIwr's own immunity/weakness/
 * resistance lookup (kept local rather than exported from damage.ts since
 * it's presentation, not rules logic).
 */
function describeIwrAdjustment(
  t: (key: StringKey) => string,
  raw: number,
  type: string,
  iwr: Iwr | null,
): string {
  if (iwr === null || type === "none") return `${raw} ${type}`;
  if (iwr.immunities.includes(type)) return `${raw} ${type}, ${t("IWR_IMMUNE_SUFFIX")}`;
  const weakness = iwr.weaknesses.find((w) => w.type === type && !(w.exceptions ?? []).includes(type));
  const resistance = iwr.resistances.find((r) => r.type === type && !(r.exceptions ?? []).includes(type));
  const parts: string[] = [];
  if (weakness) parts.push(format(t("IWR_WEAKNESS"), { value: weakness.value }));
  if (resistance) parts.push(format(t("IWR_RESISTANCE"), { value: resistance.value }));
  return parts.length > 0 ? `${raw} ${type}, ${parts.join(" / ")}` : `${raw} ${type}`;
}

/**
 * Parses a draft text input as a finite number, or `null` for blank or
 * non-numeric text. Used for the initiative value field so an untouched or
 * cleared field reads as "nothing typed" rather than `Number("")`'s `0` —
 * see commitInitiative's own comment on why that distinction is
 * load-bearing here.
 */
function parseDraft(value: string): number | null {
  if (value.trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Clamps the desktop shell's fixed `top` so the panel's bottom edge never
 * slips past the viewport, and its top edge never slips above `margin`
 * either. `margin` defaults to 12 to match the panel's own `maxHeight:
 * calc(100vh - 24px)` — a fully-clamped panel (touching both the top and
 * bottom margin) exactly fills that budget, so this and the CSS cap agree.
 *
 * `desiredTop` (flush with the anchor row, minus its usual 8px overlap) is
 * kept whenever there's room below it for the whole panel. When there
 * isn't, this shifts the top up just enough to fit. If the panel is taller
 * than the viewport even at both margins, it pins to the top margin instead
 * of going negative — the panel's own `overflowY: auto` (see panelStyle)
 * is what covers the rest, not this function.
 *
 * `panelHeight` of 0 (nothing measured yet — the very first render, or a
 * non-DOM environment) makes this a no-op: with no known height there's
 * nothing to clamp against, so `desiredTop` passes through unless it's
 * already above the margin.
 */
function clampShellTop(desiredTop: number, panelHeight: number, viewportHeight: number, margin = 12): number {
  const maxTop = Math.max(margin, viewportHeight - margin - panelHeight);
  return Math.min(Math.max(desiredTop, margin), maxTop);
}

/**
 * The row popover. On desktop it's the hover popover: rendered by
 * CombatantRow while the pointer is inside the row-plus-popover wrapper —
 * see CombatantRow for the mouseenter/mouseleave handling that keeps it open
 * across the gap. `narrow`/`targeted`/`onToggleTarget`/`onClose` are all
 * unused there (and default away) so that call site's behaviour is
 * unchanged.
 *
 * On a narrow screen there's no hover, so CombatantRow instead opens this on
 * tap and passes `narrow`. The row's own click no longer sets the target
 * there (see CombatantRow — a tap opens this popover instead), so the
 * popover carries an explicit Target control in its place; a full-screen
 * backdrop behind the panel is what "tap elsewhere" dismisses against, and
 * doubles as `onClose` for the panel's own Close button.
 */
export function RowPopover({
  combatantId,
  narrow = false,
  anchor = null,
  targeted = false,
  onToggleTarget,
  onClose,
}: {
  combatantId: string;
  narrow?: boolean;
  /** Viewport rect of the row this popover belongs to, from
   * CombatantRow. Desktop-only: the panel is portalled to `document.body`,
   * so it has no layout relationship to the row and must be placed from a
   * measurement. Null before the first measurement. */
  anchor?: DOMRect | null;
  targeted?: boolean;
  onToggleTarget?: () => void;
  onClose?: () => void;
}): React.ReactElement | null {
  const t = useT();
  const lang = useEncounter((s) => s.lang);
  const glossary = useTraitGlossary();
  const combatant = useEncounter((s) => s.encounter.combatants[combatantId]);
  const entry = useEncounter((s) => s.encounter.entries.find((e) => e.combatantIds.includes(combatantId)));
  const players = useEncounter((s) => s.players);
  const applyDamage = useEncounter((s) => s.applyDamage);
  const applyHealing = useEncounter((s) => s.applyHealing);
  const removeCombatant = useEncounter((s) => s.removeCombatant);
  const setInitiative = useEncounter((s) => s.setInitiative);
  const addCondition = useEncounter((s) => s.addCondition);
  const removeCondition = useEncounter((s) => s.removeCondition);

  const [damageType, setDamageType] = useState("none");
  const [amount, setAmount] = useState("");
  // What the field means depends on `combatant.kind` (see commitInitiative):
  // for a creature it's a d20 result the app totals with the creature's
  // modifier, since the GM rolls a monster's initiative themselves; for a PC
  // it's the party's already-reported final total, taken as-is, since a
  // player reports their own number rather than a die the GM rolled. Either
  // way this is not an editable view of the entry's current initiative (see
  // the removed initiativeDraft comment history): there is nothing to seed
  // it from, so it simply starts and stays blank between rolls.
  const [initiativeDraft, setInitiativeDraft] = useState("");
  // Which action the panel is currently set up for. Starts on "damage" (the
  // common case) so hovering alone still shows the selector for a creature
  // with relevant IWR. Healing has no damage type — DamagePopover.dc.html:
  // "Heal never shows the row at all" — so the selector is gated on this,
  // not just on whether the creature has relevant IWR.
  const [intent, setIntent] = useState<"damage" | "heal">("damage");
  const [lastChange, setLastChange] = useState<LastChange | null>(null);
  // Called unconditionally (Rules of Hooks) — result only used once
  // `combatant` is confirmed non-null below.
  const i18n = useCombatantI18n(combatant ?? { i18n: null, creatureId: undefined });

  // Desktop shell positioning: see clampShellTop's own doc comment for what
  // these feed. `panelRef` is on the visible panel div below (shared by
  // both the desktop and narrow layouts — harmless to measure in narrow
  // mode too, since nothing there reads panelHeight).
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [panelHeight, setPanelHeight] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(() =>
    typeof window === "undefined" ? 0 : window.innerHeight,
  );

  // A pure vertical resize can shrink the viewport without moving the
  // anchor row at all — CombatantRow's own scroll/resize listeners (see
  // its effect) only remeasure `anchor`, which doesn't always change on
  // resize — so this needs its own listener to catch that case for the
  // clamp below.
  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const onResize = (): void => setViewportHeight(window.innerHeight);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Measures the panel's actual rendered height after every render — its
  // content changes independently of anything else tracked here (applied
  // condition count, the persistent-damage formula field appearing, etc.)
  // — so clampShellTop below always clamps against a real number instead
  // of a guess. Only triggers a re-render when the measured height
  // actually changed, which settles immediately: height doesn't depend on
  // the `top` computed from it, so there's nothing left to change on the
  // next pass.
  useLayoutEffect(() => {
    const h = panelRef.current?.getBoundingClientRect().height ?? 0;
    if (h !== panelHeight) setPanelHeight(h);
  });

  if (!combatant) return null;

  const displayName = resolveCreatureName(combatant.name, i18n, lang);
  const relevant = relevantDamageTypes(combatant.iwr);
  const showSelector = intent === "damage" && relevant.length > 0;

  const handleDamage = (): void => {
    setIntent("damage");
    const value = Number(amount);
    // The selected type used to be dropped here entirely — IWR (including
    // immunity reducing the hit to nothing) is resolved in the store.
    if (Number.isFinite(value) && value > 0 && combatant.hp !== null) {
      const before = combatant.hp.current;
      const applied = applyIwr(value, damageType, combatant.iwr);
      const after = Math.max(0, before - applied);
      applyDamage(combatantId, value, damageType);
      setLastChange({
        delta: -applied,
        before,
        after,
        reason: applied !== value ? describeIwrAdjustment(t, value, damageType, combatant.iwr) : undefined,
      });
    }
    setDamageType("none");
  };

  const handleHeal = (): void => {
    setIntent("heal");
    const value = Number(amount);
    if (Number.isFinite(value) && value > 0 && combatant.hp !== null) {
      const before = combatant.hp.current;
      const after = Math.min(combatant.hp.max, before + value);
      applyHealing(combatantId, value);
      setLastChange({ delta: value, before, after });
    }
    setDamageType("none");
  };

  // Resolves the roster player behind a `kind: "pc"` combatant. Not every
  // one has a `playerId`: an encounter saved before the field existed, or a
  // PC the GM built by hand rather than adding from the roster, carries
  // none — null here, same as any other case with no known modifier, per
  // the brief's "degrade gracefully rather than crashing".
  const player = combatant.kind === "pc" && combatant.playerId !== undefined
    ? players.find((p) => p.id === combatant.playerId) ?? null
    : null;

  // The roster is where a PC's modifier lives (see Player.
  // initiativeModifier); the combatant's own field is a snapshot QuickAdd
  // copies in at add time. So when a roster player resolves, the roster's
  // value is the value — read through to it rather than preferring the
  // copy, which is what would let a correction in PartyManager miss a PC
  // already in the order.
  //
  // This read-through is preserved even though it currently has no visible
  // effect: `player` only resolves for `kind: "pc"` (see its own comment
  // below), and a PC's field no longer shows or uses a modifier at all (see
  // commitInitiative) — a player reports their own final total, not a die
  // result to total. So today this only ever runs for the one branch that
  // ignores its result. It stays wired up rather than removed so a future
  // reader who re-adds a PC-facing use of the modifier finds this correct
  // and not quietly broken.
  //
  // The copy still answers for a creature's Perception (the one case this
  // is actually load-bearing for today), and for a PC whose roster entry
  // has gone (removed on its own, leaving the combatant in the order) or
  // predates `playerId`. Null means genuinely unknown.
  const knownModifier = player !== null ? player.initiativeModifier : combatant.initiativeModifier;

  const initiativeValue = parseDraft(initiativeDraft);

  // Only a creature's field sums with a modifier — the GM rolls a monster's
  // initiative themselves, so the field is a d20 result (see
  // commitInitiative for the PC side of this split). Shown live as it's
  // typed, reusing the exact readout this had before the total-for-everyone
  // rework this file went through and back (08eac93/ea80e80): the bare
  // typed number when no modifier is on record, confirming nothing was
  // silently added, or the full sum when one is.
  const initiativeReadout =
    combatant.kind !== "creature" || initiativeValue === null
      ? null
      : knownModifier === null
        ? String(initiativeValue)
        : `${initiativeValue} + ${knownModifier} = ${initiativeValue + knownModifier}`;

  const commitInitiative = (): void => {
    if (!entry || initiativeValue === null) return; // blank/non-numeric value: nothing to commit — see the field's own comment.
    // See rules/initiative.ts's totalInitiative for the kind split (creature
    // d20-result-plus-modifier vs. PC reported-total-as-typed) — this is the
    // rule's original call site; Quick add and the + Add drawer reuse the
    // same function rather than re-deriving it.
    const toCommit = totalInitiative(combatant.kind, initiativeValue, knownModifier);
    setInitiative(entry.id, toCommit);
    setInitiativeDraft("");
  };

  // One click in the pickable row applies a condition at its starting
  // value — 1 for anything valued (the smallest value that's actually
  // "applied"; 0 would be indistinguishable from not having it), 0 for
  // everything else. Existing formula, if any, is left alone — nothing
  // pickable is already applied (the pickable row excludes applied slugs;
  // see PICKABLE_CONDITIONS.filter below), so there's never one to keep.
  const applyCondition = (slug: ConditionSlug): void => {
    addCondition(combatantId, slug, CONDITIONS[slug].valued ? 1 : 0);
  };

  // The store's addCondition treats "dying" specially: its `value` argument
  // is the amount to *add* (see store.ts's own comment — that's what the
  // damage path needs, since each hit raises dying by 1, or 2 on a crit),
  // while every other valued condition's `value` is the new absolute
  // number. Rather than teach the store a second calling convention for the
  // UI, these two functions are the single place that reconciles it: they
  // compute whatever addCondition's existing contract needs for each slug,
  // so a +/- click always means "one more" / "one less" to the GM regardless
  // of which convention is under the hood. See task-4-report.md for why this
  // was chosen over changing the damage path's semantics.
  const incrementCondition = (slug: ConditionSlug, value: number): void => {
    addCondition(combatantId, slug, slug === "dying" ? 1 : value + 1);
  };
  const decrementCondition = (slug: ConditionSlug, value: number): void => {
    // The step that would reach 0 *ends* the condition rather than storing a
    // 0. A "frightened 0" is not a state the rules have: applyEndOfTurn's
    // own "decrement" hook drops a condition the moment it decrements to 0
    // (rules/conditions.ts), and leaving one behind here parked a dead chip
    // on the row that the pickable list then filtered out, so the GM had to
    // click its x as well to be rid of it.
    //
    // For dying this is not just tidiness: losing the condition carries
    // fallout — data/conditions.json, dying: "Any time you lose the dying
    // condition, you gain the Wounded 1 condition..." — which only
    // removeCondition applies. Routing every slug through the same call
    // keeps the stepper and the tag's own x button on one path.
    //
    // `<= 1`, not `=== 1`, is what keeps this from ever sending a negative.
    // Nothing in the app can hand it a 0 any more — the picker starts valued
    // conditions at 1 and this function ends them at 1 — but a save written
    // before that fix can still hold a "frightened 0", and SCHEMA_VERSION
    // stays 1 with no migration to rewrite it. Ending that leftover is the
    // right answer for it too: a bare `return` would leave the GM with a
    // chip only the x button could clear, which is the very complaint this
    // fix started from.
    if (value <= 1) {
      removeCondition(combatantId, slug);
      return;
    }
    addCondition(combatantId, slug, slug === "dying" ? -1 : value - 1);
  };

  const updatePersistentDamageFormula = (formula: string): void => {
    addCondition(combatantId, "persistent-damage", 0, formula);
  };

  // Desktop keeps the placement beside the row (it's the only thing hover
  // ever needed), now measured rather than inherited from the row's box. A
  // narrow screen has no room to the side of a full-width row for that, so
  // there the panel instead sits in normal flow inside a fixed full-screen
  // backdrop below, bottom-sheet style.
  const panelStyle: React.CSSProperties = narrow
    ? {
        width: "min(420px, 100%)",
        maxHeight: "min(560px, 85vh)",
        overflowY: "auto",
        padding: "14px 15px 16px",
        borderRadius: "10px 10px 0 0",
        background: "var(--panel-high)",
        border: "1px solid oklch(0.46 0.05 200)",
        borderBottom: "none",
        boxShadow: "0 -12px 32px oklch(0.08 0.01 60 / 0.6)",
        display: "flex",
        flexDirection: "column",
        gap: "10px",
      }
    : {
        // Placement lives on the shell below, which is what's positioned
        // against the row; this is just the visible panel inside it.
        width: "330px",
        maxHeight: "calc(100vh - 24px)",
        overflowY: "auto",
        padding: "12px 13px 13px",
        borderRadius: "5px",
        background: "var(--panel-high)",
        border: "1px solid oklch(0.46 0.05 200)",
        boxShadow: "0 12px 32px oklch(0.08 0.01 60 / 0.6)",
        display: "flex",
        flexDirection: "column",
        gap: "10px",
      };

  const panel = (
    <div
      ref={panelRef}
      // The row beneath this popover is click-to-target on desktop. The
      // popover isn't a DOM descendant of the row (CombatantRow renders it
      // as a sibling), so a click here wouldn't reach the row's handler
      // anyway — stopping propagation here is defensive, per the brief,
      // against that structure ever changing. On narrow it also keeps a tap
      // on the panel itself from reaching the full-screen backdrop's
      // onClose below.
      onClick={(e) => e.stopPropagation()}
      style={panelStyle}
    >
      {narrow && (
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <button
            type="button"
            aria-pressed={targeted}
            onClick={onToggleTarget}
            style={{
              fontFamily: "inherit",
              fontSize: "12.5px",
              fontWeight: 600,
              padding: "9px 14px",
              borderRadius: "4px",
              border: `1px solid ${targeted ? "oklch(0.80 0.15 95)" : "var(--border-strong)"}`,
              background: targeted ? "oklch(0.34 0.06 95)" : "var(--panel-raised)",
              color: "var(--text)",
              cursor: "pointer",
            }}
          >
            {targeted ? t("LABEL_TARGETED") : t("LABEL_TARGET")}
          </button>
          <div style={{ flexGrow: 1 }} />
          <button
            type="button"
            aria-label={t("LABEL_CLOSE")}
            onClick={onClose}
            style={{
              fontFamily: "inherit",
              fontSize: "13px",
              fontWeight: 600,
              padding: "9px 14px",
              borderRadius: "4px",
              border: "1px solid var(--border-strong)",
              background: "var(--panel-raised)",
              color: "var(--text-dim)",
              cursor: "pointer",
            }}
          >
            {t("LABEL_CLOSE")}
          </button>
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <span style={{ fontSize: "13px", fontWeight: 600 }}>{displayName}</span>
        {combatant.hp !== null && (
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "11.5px", color: "var(--text-dim)" }}>
            {combatant.hp.current}/{combatant.hp.max}
          </span>
        )}
        {entry && (
          // Read-only — the Initiative section below is where the GM sets a
          // new value. Without this the panel edits a number it never
          // shows, which is confusing when the GM is looking at the panel,
          // not the row behind it. Em dash for unrolled, matching the row.
          <span
            title={t("CURRENT_INITIATIVE_TITLE")}
            aria-label={format(t("CURRENT_INITIATIVE_ARIA"), { value: entry.initiative === null ? t("UNROLLED_LABEL") : entry.initiative })}
            style={{ fontFamily: "var(--font-mono)", fontSize: "11.5px", color: "var(--text-dim)" }}
          >
            {entry.initiative === null ? "—" : entry.initiative}
          </span>
        )}
        <div style={{ flexGrow: 1 }} />
        <button
          type="button"
          aria-label={format(t("REMOVE_NAME_ARIA"), { name: displayName })}
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
          {t("LABEL_REMOVE")}
        </button>
      </div>

      {entry && (
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          <div
            style={{
              fontSize: "10px",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "var(--text-faint)",
            }}
          >
            {t("LABEL_INITIATIVE")}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "7px" }}>
            <input
              // A creature's field is a die result to be totalled; a PC's is
              // already the final number a player reports. Distinct accessible
              // names so the GM (or a screen reader) knows which is which —
              // see commitInitiative for why the two kinds differ.
              aria-label={combatant.kind === "creature" ? t("INITIATIVE_DIE_RESULT_ARIA") : t("INITIATIVE_VALUE_ARIA")}
              value={initiativeDraft}
              onChange={(e) => setInitiativeDraft(e.target.value)}
              style={{
                width: "44px",
                fontFamily: "var(--font-mono)",
                fontSize: "13px",
                fontWeight: 600,
                textAlign: "center",
                padding: "6px 4px",
                borderRadius: "3px",
                border: "1px solid var(--border-strong)",
                background: "var(--bg)",
                color: "var(--text)",
              }}
            />
            {initiativeReadout !== null && (
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "12px", color: "var(--text-dim)" }}>
                {initiativeReadout}
              </span>
            )}
            <div style={{ flexGrow: 1 }} />
            <button
              type="button"
              onClick={commitInitiative}
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
              {t("SET_INITIATIVE_BUTTON")}
            </button>
          </div>
        </div>
      )}

      {lastChange && (
        <div style={{ display: "flex", alignItems: "baseline", gap: "6px", flexWrap: "wrap" }}>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "12px",
              fontWeight: 600,
              color: lastChange.delta < 0 ? "var(--danger)" : "var(--ok)",
            }}
          >
            {lastChange.delta < 0 ? "−" : "+"}
            {Math.abs(lastChange.delta)}
          </span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "11px", color: "var(--text-dim)" }}>
            {lastChange.before} → {lastChange.after}
            {lastChange.reason ? ` (${lastChange.reason})` : ""}
          </span>
        </div>
      )}

      {showSelector ? (
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
            {format(t("DAMAGE_TYPE_HEADING"), { n: relevant.length })}
          </div>
          <div role="group" aria-label={t("DAMAGE_TYPE_GROUP_ARIA")} style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
            <DamageTypeButton
              type="none"
              selected={damageType === "none"}
              onSelect={() => setDamageType("none")}
            >
              {t("DAMAGE_TYPE_NONE")}
            </DamageTypeButton>
            {relevant.map((r) => (
              <DamageTypeButton
                key={r.type}
                type={r.type}
                selected={damageType === r.type}
                onSelect={() => setDamageType(r.type)}
              >
                {r.type}{" "}
                <span style={{ fontFamily: "var(--font-mono)", fontSize: "10px", opacity: 0.85 }}>{r.label}</span>
              </DamageTypeButton>
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
            {t("NO_HP_MSG")}
          </span>
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: "7px" }}>
        <input
          aria-label={t("AMOUNT_ARIA")}
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
          {t("LABEL_DAMAGE")}
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
          {t("LABEL_HEAL")}
        </button>
      </div>

      <div style={{ borderTop: "1px solid var(--border)", paddingTop: "10px", display: "flex", flexDirection: "column", gap: "8px" }}>
        <div style={{ fontSize: "10px", letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-faint)" }}>
          {t("ADD_CONDITION_HEADING")}
        </div>
        {combatant.conditions.length > 0 && (
          // Under the section title but above the pickable tags — the title
          // is the section heading and leads, with what's already applied
          // to this combatant surfaced first inside the section so the GM
          // doesn't scroll past it to see what's already on.
          <div role="group" aria-label={t("APPLIED_CONDITIONS_ARIA")} style={{ display: "flex", flexWrap: "wrap", gap: "5px" }}>
            {combatant.conditions.map((c) => {
              const def = CONDITIONS[c.slug];
              const name = conditionDisplayName(c.slug, glossary, lang);
              return (
                <div
                  key={c.slug}
                  style={{
                    fontFamily: "inherit",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    fontSize: "10.5px",
                    letterSpacing: "0.04em",
                    padding: "6px 7px 6px 10px",
                    borderRadius: "3px",
                    border: "1px solid var(--border)",
                    background: "var(--cond-bg)",
                    color: "var(--cond)",
                  }}
                >
                  {name.toUpperCase()}
                  {def.valued && (
                    <Stepper
                      name={name}
                      value={c.value}
                      onIncrease={() => incrementCondition(c.slug, c.value)}
                      onDecrease={() => decrementCondition(c.slug, c.value)}
                    />
                  )}
                  {c.slug === "persistent-damage" && (
                    <input
                      aria-label={t("PERSISTENT_DAMAGE_FORMULA_ARIA")}
                      placeholder={t("PERSISTENT_DAMAGE_PLACEHOLDER")}
                      value={c.formula ?? ""}
                      onChange={(e) => updatePersistentDamageFormula(e.target.value)}
                      style={{
                        width: "58px",
                        fontFamily: "var(--font-mono)",
                        fontSize: "11.5px",
                        padding: "4px 5px",
                        borderRadius: "3px",
                        border: "1px solid var(--border-strong)",
                        background: "var(--bg)",
                        color: "var(--text)",
                      }}
                    />
                  )}
                  <button
                    type="button"
                    aria-label={format(t("REMOVE_NAME_ARIA"), { name })}
                    onClick={() => removeCondition(combatantId, c.slug)}
                    style={{
                      fontFamily: "inherit",
                      padding: "7px 9px", // bumped for a comfortable tap target on narrow screens
                      borderRadius: "3px",
                      border: "1px solid var(--border)",
                      background: "var(--panel-raised)",
                      color: "var(--cond)",
                      cursor: "pointer",
                    }}
                  >
                    <span aria-hidden="true">×</span>
                  </button>
                </div>
              );
            })}
          </div>
        )}

        <div role="group" aria-label={t("ADD_CONDITION_GROUP_ARIA")} style={{ display: "flex", flexWrap: "wrap", gap: "5px" }}>
          {PICKABLE_CONDITIONS
            .filter((def) => !combatant.conditions.some((c) => c.slug === def.slug))
            .map((def) => (
              <PickableConditionButton
                key={def.slug}
                name={conditionDisplayName(def.slug, glossary, lang)}
                valued={def.valued}
                onClick={() => applyCondition(def.slug)}
              />
            ))}
        </div>
      </div>
    </div>
  );

  // Fixed, not absolute: the combatant list is a 340px-wide `overflow-y:
  // auto` scroller, and CSS forces its overflow-x to `auto` too, so an
  // absolutely-positioned panel sitting to the right of the row was clipped
  // to zero visible width. Fixed positioning takes the viewport as its
  // containing block, and the portal below takes the panel out of the
  // scroller entirely.
  //
  // The shell starts flush with the row's right edge and carries the 10px
  // offset as *padding*, so that strip is part of the hovered box. Placing
  // the panel itself at `right + 10px` instead left those pixels belonging
  // to neither element: the pointer crossing them fired CombatantRow's
  // mouseleave and the popover closed before it could be reached.
  //
  // top is clamped (see clampShellTop) rather than always `anchor.top - 8`:
  // that raw value places the shell purely from the row's position, with no
  // regard for how tall the panel actually is or how much room is left
  // below it — a top-row combatant on a short window used to push the
  // panel's bottom edge well past the viewport with no way to reach the
  // rows of condition tags that fell off the bottom. The panel's own
  // internal scroll (see panelStyle's overflowY: auto) already handles
  // "more content than fits"; this clamp is what keeps the panel itself on
  // screen so that scroll is reachable at all.
  const shell = (
    <div
      style={{
        position: "fixed",
        top: `${clampShellTop((anchor?.top ?? 0) - 8, panelHeight, viewportHeight)}px`,
        left: `${anchor?.right ?? 0}px`,
        paddingLeft: "10px",
        zIndex: 60,
      }}
    >
      {panel}
    </div>
  );

  // document.body, so no ancestor's `overflow` can clip it. Guarded for a
  // non-DOM environment (SSR/tests without a document).
  if (!narrow) return typeof document === "undefined" ? shell : createPortal(shell, document.body);

  // Full-screen backdrop: this is what "tap elsewhere dismisses it" means
  // here. The panel above stops its own clicks from bubbling here, so only
  // a genuine tap outside it reaches this onClose.
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "oklch(0.08 0.01 60 / 0.6)",
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        zIndex: 30,
      }}
    >
      {panel}
    </div>
  );
}
