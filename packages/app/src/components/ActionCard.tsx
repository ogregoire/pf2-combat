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
          <svg key={i} width="11" height="11" viewBox="0 0 12 12">
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

/** One action row from Main.dc.html's action list — cost pips, name, trait
 * chips and description. `disabled` renders it dimmed and folded to its
 * header line, but the row stays in the DOM: unaffordable is an indicator,
 * never a blocker (the GM might still spend a hero point, or the pool
 * tracking might be wrong). A
 * `cost: "passive"` action never has a pool to afford, so it renders as
 * Main.dc.html's separate passive-card anatomy instead of a pressable
 * button — there's nothing to "press" on a passive. */
export function ActionCard({
  action,
  disabled,
  onUse,
  glossary,
}: {
  action: Action;
  disabled: boolean;
  /** Omitted for passives, which have no pool to spend from. */
  onUse?: () => void;
  glossary: Map<string, TraitInfo>;
}): React.ReactElement {
  if (action.cost === "passive") {
    return (
      <div style={{ flexGrow: 1, padding: "9px 12px", borderRadius: "4px", background: "var(--panel)", border: "1px solid var(--border)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ fontSize: "10px", letterSpacing: "0.07em", color: "var(--text-faint)" }}>PASSIVE</span>
          <span style={{ fontWeight: 500, fontSize: "13px" }}>{action.name}</span>
        </div>
        <TraitRow traits={action.traits} glossary={glossary} />
        <div
          style={{ marginTop: "4px", fontSize: "12px", color: "var(--text-dim)" }}
          dangerouslySetInnerHTML={{ __html: renderMarkers(action.description) }}
        />
      </div>
    );
  }

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onUse}
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
      {!disabled && (
        <>
          <TraitRow traits={action.traits} glossary={glossary} />
          <div
            style={{ marginTop: "6px", fontSize: "12.5px", lineHeight: 1.5, color: "var(--text-dim)" }}
            dangerouslySetInnerHTML={{ __html: renderMarkers(action.description) }}
          />
        </>
      )}
    </button>
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
  onUse,
  glossary,
}: {
  action: Action;
  disabled: boolean;
  onUse?: () => void;
  glossary: Map<string, TraitInfo>;
}): React.ReactElement {
  return (
    <div style={{ display: "flex", gap: "6px" }}>
      <ChildArrow />
      <div style={{ flexGrow: 1, minWidth: 0 }}>
        <ActionCard action={action} disabled={disabled} onUse={onUse} glossary={glossary} />
      </div>
    </div>
  );
}
