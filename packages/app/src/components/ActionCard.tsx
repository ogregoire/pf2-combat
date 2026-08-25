import { useState } from "react";
import type { Action } from "@pf2/schema";
import { renderMarkers } from "../rules/renderMarkers.js";
import type { TraitInfo } from "../rules/traitInfo.js";
import { TraitTag } from "./TraitTag.js";

function ReactionIcon(): React.ReactElement {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" style={{ flexShrink: 0 }}>
      <circle cx="6" cy="6" r="4.5" fill="none" stroke="var(--text-faint)" strokeWidth="1.2"/>
      <path d="M6 2v8M2 6h8" stroke="var(--text-faint)" strokeWidth="1.2" strokeLinecap="round"/>
    </svg>
  );
}

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
    <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
      <ReactionIcon />
      <span style={{ fontSize: "10px", letterSpacing: "0.06em", color: "var(--text-faint)" }}>
        {cost === "free" ? "FREE" : "REACTION"}
      </span>
    </div>
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

function FoldArrow({ expanded }: { expanded: boolean }): React.ReactElement {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" style={{ flexShrink: 0, transform: expanded ? "rotate(0deg)" : "rotate(-90deg)" }}>
      <path d="M2 5l5 5 5-5" fill="none" stroke="var(--text-faint)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

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
        <FoldArrow expanded={expanded} />
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
  onUse?: () => void;
  glossary: Map<string, TraitInfo>;
}): React.ReactElement {
  if (action.cost === "passive") return <PassiveCard action={action} glossary={glossary} />;

  const cost = action.cost === "1" || action.cost === "2" || action.cost === "3" ? Number(action.cost) : 0;
  const isExpanded = selected;

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
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: isExpanded ? "6px" : 0 }}>
          <FoldArrow expanded={isExpanded} />
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
          {selected && onUse && cost > 0 && (
            <button
              type="button"
              disabled={disabled}
              onClick={(e) => {
                e.stopPropagation();
                onUse();
              }}
              style={{
                fontFamily: "inherit",
                marginLeft: "auto",
                fontSize: "11px",
                fontWeight: 600,
                padding: "5px 10px",
                borderRadius: "3px",
                border: "1px solid var(--border-strong)",
                background: disabled ? "var(--panel)" : "var(--accent-bg)",
                color: disabled ? "var(--text-faint)" : "var(--accent-text)",
                opacity: disabled ? 0.55 : 1,
                cursor: disabled ? "default" : "pointer",
                flexShrink: 0,
              }}
            >
              Use {cost} {cost === 1 ? "action" : "actions"}
            </button>
          )}
        </div>
        {isExpanded && (
          <>
            <TraitRow traits={action.traits} glossary={glossary} />
            <div
              style={{ marginTop: "6px", fontSize: "12.5px", lineHeight: 1.5, color: "var(--text-dim)" }}
              dangerouslySetInnerHTML={{ __html: renderMarkers(action.description) }}
            />
          </>
        )}
      </button>
    </div>
  );
}

export function ChildActionRow({
  action,
  disabled,
  selected = false,
  onSelect,
  onUse,
  glossary,
  parentName,
}: {
  action: Action;
  disabled: boolean;
  selected?: boolean;
  onSelect?: () => void;
  onUse?: () => void;
  glossary: Map<string, TraitInfo>;
  parentName?: string;
}): React.ReactElement {
  const actionWithParent: Action = parentName
    ? { ...action, name: `${action.name} (${parentName})` }
    : action;

  return (
    <div style={{ display: "flex", gap: "6px" }}>
      <ChildArrow />
      <div style={{ flexGrow: 1, minWidth: 0 }}>
        <ActionCard
          action={actionWithParent}
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
