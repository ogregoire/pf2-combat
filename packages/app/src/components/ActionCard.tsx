import { useState } from "react";
import type { Action } from "@pf2/schema";
import { renderMarkers } from "../rules/renderMarkers.js";
import type { TraitInfo } from "../rules/traitInfo.js";
import { TraitTag } from "./TraitTag.js";

export function CostPips({ cost }: { cost: Action["cost"] }): React.ReactElement {
  const count = cost === "1" || cost === "2" || cost === "3" ? Number(cost) : 0;
  if (count > 0) {
    return (
      <div style={{ display: "flex", gap: "3px" }}>
        {Array.from({ length: count }, (_, i) => (
          <svg key={i} data-testid="cost-pip" width="11" height="11" viewBox="0 0 12 12">
            <path d="M6 0.6 11.4 6 6 11.4 0.6 6Z" fill="var(--accent-text)" />
          </svg>
        ))}
      </div>
    );
  }
  return (
    <span style={{ fontSize: "10px", letterSpacing: "0.06em", color: "var(--text-faint)" }}>
      {cost === "free" ? "FREE" : "REACTION"}
    </span>
  );
}

function TraitRow({ traits, glossary }: { traits: string[]; glossary: Map<string, TraitInfo> }): React.ReactElement | null {
  if (traits.length === 0) return null;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", marginTop: "6px" }}>
      {traits.map((t) => (
        <TraitTag key={t} trait={t} glossary={glossary} />
      ))}
    </div>
  );
}

/** The down-then-right glyph marking a child action (e.g. Rend) as belonging
 * to the Strike rendered just above it. Drawn rather than an emoji, per the
 * brief. */
function ChildArrow(): React.ReactElement {
  return (
    <svg width="14" height="18" viewBox="0 0 14 18" aria-hidden="true" style={{ flexShrink: 0, marginTop: "2px" }}>
      <path d="M4 0 V10 H12" fill="none" stroke="var(--text-faint)" strokeWidth="1.5" />
    </svg>
  );
}

/** A passive ability: one line reading "Name PASSIVE", folded by default.
 * Passives are reference material, not something the GM presses during a
 * turn, so showing every one of their rules texts at once buried the actions
 * that matter — the name alone is enough to remember it exists, and a click
 * reveals the text when it doesn't. The PASSIVE label keeps its small-caps
 * faint styling but now trails the name, which is what the GM reads for. */
function PassiveCard({ action, glossary }: { action: Action; glossary: Map<string, TraitInfo> }): React.ReactElement {
  const [expanded, setExpanded] = useState(false);
  return (
    <button
      type="button"
      aria-expanded={expanded}
      onClick={() => setExpanded((prev) => !prev)}
      style={{
        fontFamily: "inherit",
        textAlign: "left",
        width: "100%",
        padding: "9px 12px",
        borderRadius: "4px",
        background: "var(--panel)",
        border: "1px solid var(--border)",
        cursor: "pointer",
        color: "var(--text)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <span style={{ fontWeight: 500, fontSize: "13px" }}>{action.name}</span>
        <span style={{ fontSize: "10px", letterSpacing: "0.07em", color: "var(--text-faint)" }}>PASSIVE</span>
      </div>
      {expanded && (
        <>
          <TraitRow traits={action.traits} glossary={glossary} />
          <div
            style={{ marginTop: "4px", fontSize: "12px", color: "var(--text-dim)" }}
            dangerouslySetInnerHTML={{ __html: renderMarkers(action.description) }}
          />
        </>
      )}
    </button>
  );
}

/** One action row from Main.dc.html's action list — cost pips, name, trait
 * chips and description. `disabled` means unaffordable: the row renders
 * dimmed and folded to its header line but stays pressable, because
 * unaffordable is an indicator, never a blocker (the GM might still spend a
 * hero point, or the pool tracking might be wrong) and the GM must be able
 * to read an ability they can't currently pay for.
 *
 * Pressing the row *selects* it; it never spends. Spending is the separate
 * Use button that selection reveals — pressing the row itself used to mark
 * the ability used, so merely reading Chase Prey consumed it. That Use
 * button is what `disabled` disables.
 *
 * A `cost: "passive"` action has no pool to afford and nothing to spend, so
 * it renders as `PassiveCard` above instead. */
export function ActionCard({
  action,
  disabled,
  selected = false,
  onSelect,
  onUse,
  glossary,
}: {
  action: Action;
  disabled: boolean;
  selected?: boolean;
  onSelect?: () => void;
  /** Omitted for passives and for costs that draw nothing from the pool
   * (free actions, reactions), which have nothing to spend. */
  onUse?: () => void;
  glossary: Map<string, TraitInfo>;
}): React.ReactElement {
  if (action.cost === "passive") return <PassiveCard action={action} glossary={glossary} />;

  const cost = action.cost === "1" || action.cost === "2" || action.cost === "3" ? Number(action.cost) : 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      style={{
        fontFamily: "inherit",
        textAlign: "left",
        width: "100%",
        padding: "11px 14px",
        borderRadius: "4px",
        background: disabled ? "var(--panel)" : "var(--panel-raised)",
        border: disabled ? "1px dashed var(--border)" : "1px solid var(--border-strong)",
        opacity: disabled ? 0.45 : 1,
        cursor: disabled ? "default" : "pointer",
        color: "var(--text)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
        <CostPips cost={action.cost} />
        <span style={{ fontWeight: 600 }}>{action.name}</span>
        {action.frequency && (
          <span
            style={{
              fontSize: "10px",
              letterSpacing: "0.05em",
              padding: "2px 6px",
              borderRadius: "2px",
              background: "var(--border)",
              color: "var(--text-dim)",
            }}
          >
            {action.frequency.max}/{action.frequency.per.toUpperCase()}
          </span>
        )}
      </div>
      {(!disabled || selected) && (
        <>
          <TraitRow traits={action.traits} glossary={glossary} />
          <div
            style={{ marginTop: "6px", fontSize: "12.5px", lineHeight: 1.5, color: "var(--text-dim)" }}
            dangerouslySetInnerHTML={{ __html: renderMarkers(action.description) }}
          />
        </>
      )}
    </button>
    {selected && onUse && cost > 0 && (
      <button
        type="button"
        disabled={disabled}
        onClick={onUse}
        style={{
          fontFamily: "inherit",
          alignSelf: "flex-start",
          fontSize: "12px",
          fontWeight: 600,
          padding: "7px 12px",
          borderRadius: "3px",
          border: "1px solid var(--border-strong)",
          background: disabled ? "var(--panel)" : "var(--accent-bg)",
          color: disabled ? "var(--text-faint)" : "var(--accent-text)",
          opacity: disabled ? 0.55 : 1,
          cursor: disabled ? "default" : "pointer",
        }}
      >
        Use {cost} {cost === 1 ? "action" : "actions"}
      </button>
    )}
    </div>
  );
}

/** A child action (e.g. Rend) nested directly beneath the Strike it belongs
 * to, per `buildActionList`'s narrow detection rule — the down-then-right
 * glyph and indent are the only difference from a top-level action; it's
 * still the same `ActionCard`, so its cost pip, trait tags, Requirements
 * and Effect all render inline and unexpanded (not knowing what Rend did
 * was the original complaint this exists to fix), and it's still spendable
 * from the action pool like any other action. */
export function ChildActionRow({
  action,
  disabled,
  selected = false,
  onSelect,
  onUse,
  glossary,
}: {
  action: Action;
  disabled: boolean;
  selected?: boolean;
  onSelect?: () => void;
  onUse?: () => void;
  glossary: Map<string, TraitInfo>;
}): React.ReactElement {
  return (
    <div style={{ display: "flex", gap: "6px" }}>
      <ChildArrow />
      <div style={{ flexGrow: 1, minWidth: 0 }}>
        <ActionCard
          action={action}
          disabled={disabled}
          selected={selected}
          onSelect={onSelect}
          onUse={onUse}
          glossary={glossary}
        />
      </div>
    </div>
  );
}
