import { useState } from "react";
import { useEncounter } from "../state/store.js";
import { CombatantRow } from "./CombatantRow.js";
import { GroupHeader } from "./GroupHeader.js";

const inputStyle: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: "12.5px",
  padding: "5px 7px",
  borderRadius: "3px",
  border: "1px solid var(--border-strong)",
  background: "var(--bg)",
  color: "var(--text)",
};

/**
 * Minimal group builder: check two or more rows, name it, give it a shared
 * initiative, Create. `group()` (the store action) has existed and been
 * tested since early in the branch, but nothing in the UI ever called it —
 * the GM had no way to make the encounter's heterogeneous groups (one
 * goblin chief with three goblins, sharing a turn) that the app is built to
 * support. `GroupHeader` and the grouped-row anatomy already render; this
 * is the missing input side.
 */
function GroupBuilder({
  selectedIds,
  onCancel,
  onCreate,
}: {
  selectedIds: string[];
  onCancel: () => void;
  onCreate: (name: string, initiative: number) => void;
}): React.ReactElement {
  const [name, setName] = useState("");
  const [initiative, setInitiative] = useState("");

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "8px",
        padding: "9px 10px",
        borderRadius: "4px",
        border: "1px solid var(--border-strong)",
        background: "var(--panel-raised)",
      }}
    >
      <span style={{ fontSize: "11.5px", color: "var(--text-dim)", flexShrink: 0 }}>
        {selectedIds.length} selected
      </span>
      <input
        aria-label="Group name"
        placeholder="Group name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        style={{ ...inputStyle, flexGrow: 1, fontFamily: "var(--font-ui)" }}
      />
      <input
        aria-label="Group initiative"
        placeholder="Init"
        value={initiative}
        onChange={(e) => setInitiative(e.target.value)}
        style={{ ...inputStyle, width: "48px", textAlign: "center" }}
      />
      <button
        type="button"
        onClick={() => onCreate(name.trim() === "" ? "Group" : name.trim(), Number(initiative) || 0)}
        style={{
          fontFamily: "inherit",
          fontSize: "12px",
          fontWeight: 600,
          padding: "6px 10px",
          borderRadius: "3px",
          border: "1px solid var(--border-strong)",
          background: "var(--accent-bg)",
          color: "var(--accent-text)",
          cursor: "pointer",
          flexShrink: 0,
        }}
      >
        Create group
      </button>
      <button
        type="button"
        onClick={onCancel}
        style={{
          fontFamily: "inherit",
          fontSize: "12px",
          padding: "6px 9px",
          borderRadius: "3px",
          border: "1px solid var(--border)",
          background: "var(--panel)",
          color: "var(--text-dim)",
          cursor: "pointer",
          flexShrink: 0,
        }}
      >
        Cancel
      </button>
    </div>
  );
}

/** The left-pane combatant list — reads the encounter store directly.
 * Entries are already kept sorted by initiative descending by the store. */
export function CombatantList(): React.ReactElement {
  const entries = useEncounter((s) => s.encounter.entries);
  const activeEntryIndex = useEncounter((s) => s.encounter.activeEntryIndex);
  const group = useEncounter((s) => s.group);

  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const toggleSelect = (id: string): void => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleCreateGroup = (name: string, initiative: number): void => {
    group(selectedIds, name, initiative);
    setSelectedIds([]);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "3px", padding: "0 8px 12px" }}>
      {selectedIds.length >= 2 && (
        <GroupBuilder selectedIds={selectedIds} onCancel={() => setSelectedIds([])} onCreate={handleCreateGroup} />
      )}

      {entries.map((entry, index) => {
        const isActive = index === activeEntryIndex;

        if (entry.groupName === null) {
          const id = entry.combatantIds[0];
          if (id === undefined) return null;
          return (
            <CombatantRow
              key={entry.id}
              id={id}
              initiative={entry.initiative}
              active={isActive}
              selected={selectedIds.includes(id)}
              onToggleSelect={() => toggleSelect(id)}
            />
          );
        }

        return (
          <div key={entry.id}>
            <GroupHeader
              name={entry.groupName}
              initiative={entry.initiative}
              memberCount={entry.combatantIds.length}
              active={isActive}
            />
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "2px",
                paddingLeft: "16px",
                borderLeft: `3px solid ${isActive ? "oklch(0.70 0.15 55)" : "oklch(0.34 0.04 200)"}`,
              }}
            >
              {entry.combatantIds.map((id) => (
                <CombatantRow
                  key={id}
                  id={id}
                  grouped
                  active={isActive}
                  selected={selectedIds.includes(id)}
                  onToggleSelect={() => toggleSelect(id)}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
