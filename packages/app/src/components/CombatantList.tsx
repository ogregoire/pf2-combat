import { useState } from "react";
import type { Creature, IndexEntry } from "@pf2/schema";
import { loadCreature } from "../data/creatures.js";
import { useEncounter } from "../state/store.js";
import { CombatantRow } from "./CombatantRow.js";
import { GroupHeader } from "./GroupHeader.js";
import { QuickAdd } from "./QuickAdd.js";

const inputStyle: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: "12.5px",
  padding: "5px 7px",
  borderRadius: "3px",
  border: "1px solid var(--border-strong)",
  background: "var(--bg)",
  color: "var(--text)",
};

function GroupBuilder({
  selectedIds,
  selectedInitiatives,
  onCancel,
  onCreate,
}: {
  selectedIds: string[];
  selectedInitiatives: number[];
  onCancel: () => void;
  onCreate: (name: string, initiative: number) => void;
}): React.ReactElement {
  const allSame = selectedInitiatives.length > 0 && selectedInitiatives.every((v) => v === selectedInitiatives[0]);
  const [name, setName] = useState("");
  const [initiative, setInitiative] = useState(allSame ? String(selectedInitiatives[0]) : "");

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
 * Entries are already kept sorted by initiative descending by the store.
 * `quickAddEntries`/`loadCreatureFn` feed `<QuickAdd>`, always visible above
 * the list — both default to the empty catalog/production loader so
 * existing callers (and tests) that don't pass them keep working. */
export function CombatantList({
  quickAddEntries = [],
  loadCreatureFn = loadCreature,
}: {
  quickAddEntries?: IndexEntry[];
  loadCreatureFn?: (id: string) => Promise<Creature>;
} = {}): React.ReactElement {
  const entries = useEncounter((s) => s.encounter.entries);
  const activeEntryIndex = useEncounter((s) => s.encounter.activeEntryIndex);
  const group = useEncounter((s) => s.group);

  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const toggleSelect = (id: string): void => {
    const alreadyGrouped = entries.some((e) => e.groupName !== null && e.combatantIds.includes(id));
    if (alreadyGrouped) return;
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleCreateGroup = (name: string, initiative: number): void => {
    group(selectedIds, name, initiative);
    setSelectedIds([]);
  };

  const chainIcon = (
    <svg width="12" height="12" viewBox="0 0 12 12" style={{ flexShrink: 0 }}>
      <path d="M3 4a1.5 1.5 0 100 3 1.5 1.5 0 000-3zm6 0a1.5 1.5 0 100 3 1.5 1.5 0 000-3zm-4.5 1.5h3"
            fill="none" stroke="oklch(0.34 0.04 200)" strokeWidth="1" strokeLinecap="round"/>
    </svg>
  );

  const selectedInitiatives = selectedIds
    .map((id) => entries.find((e) => e.combatantIds.includes(id))?.initiative ?? null)
    .filter((i) => i !== null) as number[];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "3px", padding: "0 8px 12px" }}>
      <QuickAdd entries={quickAddEntries} loadCreatureFn={loadCreatureFn} />

      {selectedIds.length >= 2 && (
        <GroupBuilder selectedIds={selectedIds} selectedInitiatives={selectedInitiatives} onCancel={() => setSelectedIds([])} onCreate={handleCreateGroup} />
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
              delayed={entry.delayed}
              initiativeBeforeDelay={entry.initiativeBeforeDelay}
              active={isActive}
              selected={selectedIds.includes(id)}
              onToggleSelect={() => toggleSelect(id)}
            />
          );
        }

        return (
          <div key={entry.id}>
            <GroupHeader
              entryId={entry.id}
              name={entry.groupName}
              initiative={entry.initiative}
              delayed={entry.delayed}
              initiativeBeforeDelay={entry.initiativeBeforeDelay}
              memberCount={entry.combatantIds.length}
              active={isActive}
            />
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "3px",
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
                  selected={false}
                  onToggleSelect={() => {}}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
