import { Fragment, useRef, useState } from "react";
import type { Creature, IndexEntry } from "@pf2/schema";
import { loadCreature } from "../data/creatures.js";
import { useT } from "../i18n/index.js";
import { canMoveEntry, hasLegalMove, useEncounter } from "../state/store.js";
import { CombatantRow, type RowDrag } from "./CombatantRow.js";
import { dropPlacement } from "./dropPlacement.js";
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
  const t = useT();
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
        aria-label={t("GROUP_NAME_LABEL")}
        placeholder={t("GROUP_NAME_LABEL")}
        value={name}
        onChange={(e) => setName(e.target.value)}
        style={{ ...inputStyle, flexGrow: 1, fontFamily: "var(--font-ui)" }}
      />
      <input
        aria-label={t("GROUP_INITIATIVE_ARIA")}
        placeholder={t("GROUP_INITIATIVE_PLACEHOLDER")}
        value={initiative}
        onChange={(e) => setInitiative(e.target.value)}
        style={{ ...inputStyle, width: "48px", textAlign: "center" }}
      />
      <button
        type="button"
        onClick={() => onCreate(name.trim() === "" ? t("DEFAULT_GROUP_NAME") : name.trim(), Number(initiative) || 0)}
        style={{
          fontFamily: "inherit",
          fontSize: "12px",
          fontWeight: 600,
          padding: "6px 10px",
          borderRadius: "3px",
          border: "1px solid var(--border-strong)",
          background: "var(--select)",
          color: "var(--select-text)",
          cursor: "pointer",
          flexShrink: 0,
        }}
      >
        {t("CREATE_GROUP_BUTTON")}
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
        {t("LABEL_CANCEL")}
      </button>
    </div>
  );
}

/** A live drag of one entry: which, how tall its row was (so the empty
 * slot keeps the list from shifting), the slot it would land in — "before
 * this entry", null for the very end — and whether the row has left the
 * flow yet. */
interface DragState {
  entryId: string;
  height: number;
  beforeId: string | null;
  hidden: boolean;
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
  const combatants = useEncounter((s) => s.encounter.combatants);
  const group = useEncounter((s) => s.group);
  const moveEntry = useEncounter((s) => s.moveEntry);

  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // The drag gesture, owned here because only the list knows every entry
  // and so where a drop would land. The empty slot the GM sees follows
  // this state: it is drawn before `drag.beforeId` (or last), and the
  // dragged row itself hides. Handlers read the ref, not the state, so a
  // dragover that fires before React re-renders still sees the latest.
  const [drag, setDrag] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);
  dragRef.current = drag;

  const slotAfter = (entryId: string): string | null => {
    const i = entries.findIndex((e) => e.id === entryId);
    return entries[i + 1]?.id ?? null;
  };

  const startDrag = (e: React.DragEvent<HTMLElement>, entryId: string): void => {
    e.dataTransfer.setData("text/plain", entryId);
    e.dataTransfer.effectAllowed = "move";
    setDrag({ entryId, height: e.currentTarget.offsetHeight, beforeId: slotAfter(entryId), hidden: false });
    // Chrome abandons a drag whose source leaves the layout during
    // dragstart, so the row only hides (and the slot only appears) a tick
    // later, once the browser has taken its drag image.
    setTimeout(() => setDrag((d) => (d !== null && d.entryId === entryId ? { ...d, hidden: true } : d)), 0);
  };

  /** A dragover on the slot "before `candidate`": moves the empty slot
   * there if that placement is legal, else refuses the drop (no
   * preventDefault, "not-allowed" cursor) and leaves the slot where it
   * was. The slot above an unrolled entry is the top of the rolled order,
   * since the sort pins unrolled entries above everything regardless. */
  const hoverSlot = (e: React.DragEvent, candidate: string | null): void => {
    const d = dragRef.current;
    if (d === null) return; // not one of ours (a file, some text)
    let beforeId = candidate === d.entryId ? slotAfter(d.entryId) : candidate;
    if (beforeId !== null && entries.find((x) => x.id === beforeId)?.initiative === null) {
      beforeId = entries.find((x) => x.initiative !== null && x.id !== d.entryId)?.id ?? null;
    }
    if (!canMoveEntry(entries, combatants, d.entryId, beforeId)) {
      e.dataTransfer.dropEffect = "none";
      return;
    }
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (beforeId !== d.beforeId) setDrag({ ...d, beforeId });
  };

  const finishDrag = (e: React.DragEvent): void => {
    e.preventDefault();
    const d = dragRef.current;
    if (d !== null) moveEntry(d.entryId, d.beforeId);
    setDrag(null);
  };

  /** Drag wiring for the row or group wrapper standing for `entry`: a drag
   * source only when it has somewhere legal to go (never when unrolled —
   * the sort pins it to the top whatever a drag says — and never when its
   * only legal slot is the one it is in), a drop target always — the top
   * half of it means "before", the bottom half "after". */
  const dragFor = (entry: Entry, index: number): RowDrag => ({
    hidden: drag !== null && drag.hidden && drag.entryId === entry.id,
    props: {
      ...(!hasLegalMove(entries, combatants, entry.id)
        ? {}
        : {
            draggable: true,
            onDragStart: (e: React.DragEvent<HTMLDivElement>) => startDrag(e, entry.id),
            onDragEnd: () => setDrag(null),
          }),
      onDragOver: (e: React.DragEvent<HTMLDivElement>) =>
        hoverSlot(e, dropPlacement(e, e.currentTarget) === "before" ? entry.id : (entries[index + 1]?.id ?? null)),
      onDrop: finishDrag,
    },
  });

  const slot =
    drag !== null && drag.hidden ? (
      <div
        data-testid="drop-slot"
        aria-hidden="true"
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
        }}
        onDrop={finishDrag}
        style={{
          height: `${drag.height}px`,
          borderRadius: "4px",
          border: "2px dashed var(--select)",
          background: "var(--select-bg)",
        }}
      />
    ) : null;

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
            fill="none" stroke="var(--info)" strokeWidth="1" strokeLinecap="round"/>
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
        const rowDrag = dragFor(entry, index);
        // The empty slot sits where the dragged entry would land.
        const slotHere = drag !== null && drag.beforeId === entry.id ? slot : null;

        if (entry.groupName === null) {
          const id = entry.combatantIds[0];
          if (id === undefined) return null;
          return (
            <Fragment key={entry.id}>
            {slotHere}
            <CombatantRow
              id={id}
              initiative={entry.initiative}
              delayed={entry.delayed}
              initiativeBeforeDelay={entry.initiativeBeforeDelay}
              active={isActive}
              selected={selectedIds.includes(id)}
              onToggleSelect={() => toggleSelect(id)}
              drag={rowDrag}
            />
            </Fragment>
          );
        }

        return (
          <Fragment key={entry.id}>
          {slotHere}
          <div
            {...rowDrag.props}
            style={{ display: rowDrag.hidden ? "none" : undefined }}
          >
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
                borderLeft: `3px solid ${isActive ? "var(--turn)" : "var(--info)"}`,
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
          </Fragment>
        );
      })}

      {drag !== null && drag.beforeId === null && slot}

      {/* Hovering a row's lower half already means "after it", but a thin
         strip below the last row keeps the very end reachable without
         aiming at a half-row. */}
      {entries.length > 0 && (
        <div aria-hidden="true" style={{ minHeight: "14px" }} onDragOver={(e) => hoverSlot(e, null)} onDrop={finishDrag} />
      )}
    </div>
  );
}
