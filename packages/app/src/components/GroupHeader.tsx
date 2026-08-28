import { useState } from "react";
import { useT } from "../i18n/index.js";
import { useEncounter } from "../state/store.js";

const ACTIVE_BORDER = "oklch(0.70 0.15 55)";
const ACTIVE_BG = "oklch(0.27 0.030 55)";
const ACTIVE_RING = "0 0 0 1px oklch(0.44 0.08 55)";
const ACTIVE_INITIATIVE_COLOR = "oklch(0.86 0.12 60)";

function ChainIcon(): React.ReactElement {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" style={{ flexShrink: 0, color: "oklch(0.52 0.09 200)" }}>
      <circle cx="3" cy="6" r="1.5" fill="none" stroke="currentColor" strokeWidth="1.2"/>
      <circle cx="9" cy="6" r="1.5" fill="none" stroke="currentColor" strokeWidth="1.2"/>
      <path d="M4.5 6h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
    </svg>
  );
}

export function GroupHeader({
  entryId,
  name,
  initiative,
  delayed = false,
  initiativeBeforeDelay = null,
  memberCount,
  active = false,
}: {
  entryId: string;
  name: string;
  initiative: number | null;
  /** A whole group can Delay — Delay is a property of the turn-order entry,
   * and a group is one entry — so the header carries the same struck-through
   * treatment a standalone row does (see StandaloneRow). */
  delayed?: boolean;
  initiativeBeforeDelay?: number | null;
  memberCount: number;
  active?: boolean;
}): React.ReactElement {
  const t = useT();
  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState(name);
  const [editingInit, setEditingInit] = useState(false);
  const [newInit, setNewInit] = useState(initiative === null ? "" : String(initiative));
  const ungroup = useEncounter((s) => s.ungroup);
  const renameGroup = useEncounter((s) => s.renameGroup);
  const setInitiative = useEncounter((s) => s.setInitiative);

  const handleRename = (): void => {
    if (newName.trim()) {
      renameGroup(entryId, newName.trim());
    }
    setRenaming(false);
  };

  const handleInitiativeChange = (): void => {
    const newValue = Number(newInit) || 0;
    setInitiative(entryId, newValue);
    setEditingInit(false);
  };

  return (
    <div
      data-active={active}
      style={{
        marginTop: "4px",
        display: "flex",
        alignItems: "center",
        gap: "8px",
        padding: "6px 10px 5px",
        borderRadius: "4px 4px 0 0",
        background: active ? ACTIVE_BG : "var(--info-bg)",
        borderLeft: `3px solid ${active ? ACTIVE_BORDER : "oklch(0.52 0.09 200)"}`,
        boxShadow: active ? ACTIVE_RING : "none",
      }}
    >
      <ChainIcon />
      {editingInit ? (
        <input
          autoFocus
          type="number"
          value={newInit}
          onChange={(e) => setNewInit(e.target.value)}
          onBlur={handleInitiativeChange}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleInitiativeChange();
            if (e.key === "Escape") {
              setNewInit(String(initiative));
              setEditingInit(false);
            }
          }}
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "15px",
            fontWeight: 600,
            width: "32px",
            textAlign: "right",
            padding: "4px 4px",
            borderRadius: "3px",
            border: "1px solid var(--border-strong)",
            background: "var(--panel)",
            color: "var(--text)",
            textDecoration: delayed ? "line-through" : "none",
          }}
        />
      ) : (
        <button
          type="button"
          onClick={() => setEditingInit(true)}
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "15px",
            fontWeight: 600,
            width: "24px",
            textAlign: "right",
            color: active ? ACTIVE_INITIATIVE_COLOR : "oklch(0.74 0.04 200)",
            background: "transparent",
            border: "none",
            cursor: "pointer",
            padding: 0,
            textDecoration: delayed ? "line-through" : "none",
          }}
        >
          {initiative === null ? "—" : initiative}
        </button>
      )}
      {delayed && (
        <span style={{ fontSize: "10px", letterSpacing: "0.06em", color: "var(--info)" }}>{t("DELAYED_LABEL")}</span>
      )}
      {!delayed && initiativeBeforeDelay !== null && (
        <span style={{ fontSize: "11px", color: "var(--text-faint)", textDecoration: "line-through" }}>
          {initiativeBeforeDelay}
        </span>
      )}
      {renaming ? (
        <input
          autoFocus
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onBlur={handleRename}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleRename();
            if (e.key === "Escape") {
              setNewName(name);
              setRenaming(false);
            }
          }}
          style={{
            fontFamily: "var(--font-ui)",
            fontSize: "12px",
            fontWeight: 600,
            padding: "4px 6px",
            borderRadius: "3px",
            border: "1px solid var(--border-strong)",
            background: "var(--panel)",
            color: "var(--text)",
            minWidth: "120px",
          }}
        />
      ) : (
        <button
          type="button"
          onClick={() => setRenaming(true)}
          style={{
            fontFamily: "inherit",
            fontSize: "12px",
            fontWeight: 600,
            letterSpacing: "0.03em",
            color: "oklch(0.84 0.05 200)",
            background: "transparent",
            border: "none",
            cursor: "pointer",
            padding: 0,
          }}
        >
          {name.toUpperCase()}
        </button>
      )}
      <div style={{ flexGrow: 1 }} />
      <button
        type="button"
        onClick={() => ungroup(entryId)}
        style={{
          fontFamily: "inherit",
          fontSize: "10px",
          padding: "4px 6px",
          borderRadius: "2px",
          border: "1px solid var(--border)",
          background: "var(--panel)",
          color: "var(--text-dim)",
          cursor: "pointer",
          marginRight: "4px",
        }}
      >
        {t("UNGROUP_BUTTON")}
      </button>
    </div>
  );
}
