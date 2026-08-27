import { useState } from "react";
import { createPortal } from "react-dom";
import { useEncounter } from "../state/store.js";
import { applyIwr, relevantDamageTypes, type Iwr } from "../rules/damage.js";
import { CONDITIONS, PICKABLE_CONDITIONS, type ConditionSlug } from "../rules/conditions.js";
import { DamageTypeIcon, damageTypeStyle } from "./damageTypes.js";

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
function describeIwrAdjustment(raw: number, type: string, iwr: Iwr | null): string {
  if (iwr === null || type === "none") return `${raw} ${type}`;
  if (iwr.immunities.includes(type)) return `${raw} ${type}, immune`;
  const weakness = iwr.weaknesses.find((w) => w.type === type && !(w.exceptions ?? []).includes(type));
  const resistance = iwr.resistances.find((r) => r.type === type && !(r.exceptions ?? []).includes(type));
  const parts: string[] = [];
  if (weakness) parts.push(`weakness ${weakness.value}`);
  if (resistance) parts.push(`resistance ${resistance.value}`);
  return parts.length > 0 ? `${raw} ${type}, ${parts.join(" / ")}` : `${raw} ${type}`;
}

/**
 * Parses a draft text input as a finite number, or `null` for blank or
 * non-numeric text. Used for the initiative die result and the one-time PC
 * modifier prompt so an untouched or cleared field reads as "nothing typed"
 * rather than `Number("")`'s `0` — see commitInitiative's own comment on
 * why that distinction is load-bearing here.
 */
function parseDraft(value: string): number | null {
  if (value.trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
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
  const combatant = useEncounter((s) => s.encounter.combatants[combatantId]);
  const entry = useEncounter((s) => s.encounter.entries.find((e) => e.combatantIds.includes(combatantId)));
  const players = useEncounter((s) => s.players);
  const applyDamage = useEncounter((s) => s.applyDamage);
  const applyHealing = useEncounter((s) => s.applyHealing);
  const removeCombatant = useEncounter((s) => s.removeCombatant);
  const setInitiative = useEncounter((s) => s.setInitiative);
  const setPlayers = useEncounter((s) => s.setPlayers);
  const addCondition = useEncounter((s) => s.addCondition);
  const removeCondition = useEncounter((s) => s.removeCondition);

  const [damageType, setDamageType] = useState("none");
  const [amount, setAmount] = useState("");
  // The die result just rolled, not an editable view of the entry's current
  // initiative (see the removed initiativeDraft) — there is nothing to seed
  // it from, so it simply starts and stays blank between rolls.
  const [dieResult, setDieResult] = useState("");
  // A kind: "pc" combatant's modifier lives on the roster (Player.
  // initiativeModifier), not the combatant, so it survives between fights.
  // The first time it's needed and still unknown, this collects it inline;
  // committing writes it back via setPlayers (see commitInitiative).
  const [pcModifierDraft, setPcModifierDraft] = useState("");
  // Which action the panel is currently set up for. Starts on "damage" (the
  // common case) so hovering alone still shows the selector for a creature
  // with relevant IWR. Healing has no damage type — DamagePopover.dc.html:
  // "Heal never shows the row at all" — so the selector is gated on this,
  // not just on whether the creature has relevant IWR.
  const [intent, setIntent] = useState<"damage" | "heal">("damage");
  const [lastChange, setLastChange] = useState<LastChange | null>(null);

  if (!combatant) return null;

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
        reason: applied !== value ? describeIwrAdjustment(value, damageType, combatant.iwr) : undefined,
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
  // copy, which is what makes a correction in PartyManager reach a PC
  // already in the order. That is when a GM corrects it: they notice the
  // modifier is wrong because a roll came out wrong, mid-fight, and the
  // roster edit would otherwise fix only the next encounter.
  //
  // Including a null: clearing the field in PartyManager means "unknown",
  // and it has to mean that here too, or the prompt below could never be
  // reopened for a PC whose stale copy is precisely what's wrong.
  //
  // The copy still answers for everything with no roster player behind it —
  // a creature's Perception, and a PC whose roster entry has gone (removed
  // on its own, leaving the combatant in the order) or predates `playerId`.
  // Null means genuinely unknown.
  const knownModifier = player !== null ? player.initiativeModifier : combatant.initiativeModifier;
  // Only a PC gets the one-time prompt below — a creature with no
  // Perception on record has nowhere to look one up, so it just rolls with
  // no modifier instead of asking.
  const needsModifierPrompt = combatant.kind === "pc" && knownModifier === null;
  const typedPcModifier = needsModifierPrompt ? parseDraft(pcModifierDraft) : null;
  const effectiveModifier = knownModifier ?? typedPcModifier;

  const dieValue = parseDraft(dieResult);
  const initiativeReadout =
    dieValue === null
      ? null
      : effectiveModifier === null
        ? String(dieValue)
        : `${dieValue} + ${effectiveModifier} = ${dieValue + effectiveModifier}`;

  const commitInitiative = (): void => {
    if (!entry || dieValue === null) return; // blank/non-numeric die result: nothing to commit — see the field's own comment.
    setInitiative(entry.id, effectiveModifier === null ? dieValue : dieValue + effectiveModifier);

    // First time this PC's modifier is known: save it to the roster so the
    // next fight already has it (PartyManager reads it straight off
    // Player.initiativeModifier). No resolved player just means there is
    // nowhere to save it — it'll be asked again next time, which is the
    // graceful-degradation the brief calls for rather than a crash.
    if (needsModifierPrompt && player !== null && typedPcModifier !== null) {
      setPlayers(players.map((p) => (p.id === player.id ? { ...p, initiativeModifier: typedPcModifier } : p)));
    }

    setDieResult("");
    setPcModifierDraft("");
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
    if (value <= 0) return; // floor at 0 — never send a call that would go negative
    // Stepping dying from 1 down to 0 is *losing* the condition, not just
    // lowering its value — data/conditions.json, dying: "Any time you lose
    // the dying condition, you gain the Wounded 1 condition...". Routing
    // through removeCondition here keeps this in sync with the tag's own
    // "x" button, which already goes through the same path (see store.ts's
    // removeCondition). Sending addCondition(id, "dying", -1) instead would
    // write a literal "dying 0" — dyingOnGain's own doc comment warns
    // against exactly that nonsense state — and skip the Wounded fallout.
    if (slug === "dying" && value === 1) {
      removeCondition(combatantId, "dying");
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
            {targeted ? "Targeted" : "Target"}
          </button>
          <div style={{ flexGrow: 1 }} />
          <button
            type="button"
            aria-label="Close"
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
            Close
          </button>
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <span style={{ fontSize: "13px", fontWeight: 600 }}>{combatant.name}</span>
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
            title="Current initiative"
            aria-label={`Current initiative ${entry.initiative === null ? "unrolled" : entry.initiative}`}
            style={{ fontFamily: "var(--font-mono)", fontSize: "11.5px", color: "var(--text-dim)" }}
          >
            {entry.initiative === null ? "—" : entry.initiative}
          </span>
        )}
        <div style={{ flexGrow: 1 }} />
        <button
          type="button"
          aria-label={`Remove ${combatant.name}`}
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
          Remove
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
            Initiative
          </div>
          {needsModifierPrompt && (
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <span style={{ flexGrow: 1, fontSize: "11.5px", color: "var(--text-dim)" }}>
                Initiative modifier for {combatant.name}
              </span>
              <input
                aria-label={`Initiative modifier for ${combatant.name}`}
                value={pcModifierDraft}
                onChange={(e) => setPcModifierDraft(e.target.value)}
                style={{
                  width: "42px",
                  fontFamily: "var(--font-mono)",
                  fontSize: "13px",
                  textAlign: "center",
                  padding: "6px 4px",
                  borderRadius: "3px",
                  border: "1px solid var(--border-strong)",
                  background: "var(--bg)",
                  color: "var(--text)",
                }}
              />
            </div>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: "7px" }}>
            <input
              aria-label="Initiative die result"
              value={dieResult}
              onChange={(e) => setDieResult(e.target.value)}
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
              Set initiative
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
            Damage type — {relevant.length} relevant
          </div>
          <div role="group" aria-label="damage type" style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
            <DamageTypeButton
              type="none"
              selected={damageType === "none"}
              onSelect={() => setDamageType("none")}
            >
              None
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
            No HP on record — Damage and Heal are disabled.
          </span>
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: "7px" }}>
        <input
          aria-label="amount"
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
          Damage
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
          Heal
        </button>
      </div>

      <div style={{ borderTop: "1px solid var(--border)", paddingTop: "10px", display: "flex", flexDirection: "column", gap: "8px" }}>
        <div style={{ fontSize: "10px", letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-faint)" }}>
          Add condition
        </div>

        {combatant.conditions.length > 0 && (
          // Under the section title but above the pickable tags — the title
          // is the section heading and leads, with what's already applied
          // to this combatant surfaced first inside the section so the GM
          // doesn't scroll past it to see what's already on.
          <div role="group" aria-label="applied conditions" style={{ display: "flex", flexWrap: "wrap", gap: "5px" }}>
            {combatant.conditions.map((c) => {
              const def = CONDITIONS[c.slug];
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
                  {def.name.toUpperCase()}
                  {def.valued && (
                    <Stepper
                      name={def.name}
                      value={c.value}
                      onIncrease={() => incrementCondition(c.slug, c.value)}
                      onDecrease={() => decrementCondition(c.slug, c.value)}
                    />
                  )}
                  {c.slug === "persistent-damage" && (
                    <input
                      aria-label="Persistent damage formula"
                      placeholder="e.g. 2d6"
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
                    aria-label={`Remove ${def.name}`}
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

        <div role="group" aria-label="add condition" style={{ display: "flex", flexWrap: "wrap", gap: "5px" }}>
          {PICKABLE_CONDITIONS
            .filter((def) => !combatant.conditions.some((c) => c.slug === def.slug))
            .map((def) => (
              <PickableConditionButton
                key={def.slug}
                name={def.name}
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
  const shell = (
    <div
      style={{
        position: "fixed",
        top: `${(anchor?.top ?? 0) - 8}px`,
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
