import { useEncounter } from "../state/store.js";
import { CombatantRow } from "./CombatantRow.js";
import { GroupHeader } from "./GroupHeader.js";

/** The left-pane combatant list — reads the encounter store directly.
 * Entries are already kept sorted by initiative descending by the store. */
export function CombatantList(): React.ReactElement {
  const entries = useEncounter((s) => s.encounter.entries);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "3px", padding: "0 8px 12px" }}>
      {entries.map((entry) => {
        if (entry.groupName === null) {
          const id = entry.combatantIds[0];
          if (id === undefined) return null;
          return <CombatantRow key={entry.id} id={id} initiative={entry.initiative} />;
        }

        return (
          <div key={entry.id}>
            <GroupHeader
              name={entry.groupName}
              initiative={entry.initiative}
              memberCount={entry.combatantIds.length}
            />
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "2px",
                paddingLeft: "16px",
                borderLeft: "3px solid oklch(0.34 0.04 200)",
              }}
            >
              {entry.combatantIds.map((id) => (
                <CombatantRow key={id} id={id} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
