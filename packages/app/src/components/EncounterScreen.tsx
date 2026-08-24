import { encounterXp, partyLevelFor } from "../rules/xp.js";
import { useEncounter } from "../state/store.js";
import { ActiveCombatant } from "./ActiveCombatant.js";
import { CombatantList } from "./CombatantList.js";
import { TurnManager } from "./TurnManager.js";

/** Main.dc.html's top bar: encounter name, the XP award per character (the
 * plain sum of creature XP — GM Core says this never changes with party
 * size, so it is computed once against the derived party level and never
 * divided or adjusted), and the present/party-level readout. Difficulty
 * badges are out of scope for phase 1 and are deliberately not built here. */
function TopBar(): React.ReactElement {
  const name = useEncounter((s) => s.encounter.name);
  const combatants = useEncounter((s) => s.encounter.combatants);
  const players = useEncounter((s) => s.players);

  const creatureLevels = Object.values(combatants)
    .filter((c) => c.kind === "creature")
    .map((c) => c.level);
  const presentPlayers = players.filter((p) => p.present);
  const partyLevel = partyLevelFor(presentPlayers.map((p) => p.level)).level;
  const xp = encounterXp(creatureLevels, partyLevel);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "24px",
        padding: "0 20px",
        height: "56px",
        borderBottom: "1px solid var(--border)",
        background: "var(--panel)",
        flexShrink: 0,
      }}
    >
      <div style={{ fontFamily: "var(--font-display)", fontSize: "19px", fontWeight: 600, letterSpacing: "0.01em" }}>
        {name}
      </div>

      <div
        title="Each character gains the encounter's full XP — party size does not change the award"
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: "5px",
          padding: "3px 11px 4px",
          borderRadius: "3px",
          background: "var(--ok-bg)",
          border: "1px solid var(--border-strong)",
        }}
      >
        <span style={{ fontFamily: "var(--font-mono)", fontSize: "17px", fontWeight: 600, color: "var(--ok)" }}>
          {xp}
        </span>
        <span style={{ fontSize: "10.5px", letterSpacing: "0.06em", color: "var(--text-dim)" }}>XP each</span>
      </div>

      <div style={{ flexGrow: 1 }} />

      <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px", color: "var(--text-dim)" }}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        </svg>
        <span>
          {presentPlayers.length} of {players.length} present
        </span>
        <span style={{ color: "var(--text-faint)" }}>&mdash;</span>
        <span>party level {partyLevel}</span>
      </div>
    </div>
  );
}

/** Assembles Main.dc.html's whole screen: the top bar plus the three panes,
 * each carrying the `data-testid` its own tests key off. `CombatantList`,
 * `ActiveCombatant` and `TurnManager` already own their internal content —
 * this component owns only the outer layout (pane widths, borders) and the
 * top bar, matching the mockup's spacing. */
export function EncounterScreen(): React.ReactElement {
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100dvh", background: "var(--bg)", color: "var(--text)" }}>
      <TopBar />

      <div style={{ display: "flex", flexGrow: 1, minHeight: 0 }}>
        <div
          data-testid="combatant-list"
          style={{
            width: "340px",
            flexShrink: 0,
            borderRight: "1px solid var(--border)",
            display: "flex",
            flexDirection: "column",
            background: "var(--panel)",
            overflowY: "auto",
          }}
        >
          <div style={{ padding: "12px 14px 10px", fontSize: "11px", letterSpacing: "0.09em", textTransform: "uppercase", color: "var(--text-faint)" }}>
            Initiative
          </div>
          <CombatantList />
        </div>

        <div data-testid="active-combatant" style={{ display: "flex", flexGrow: 1, minWidth: 0, minHeight: 0 }}>
          <ActiveCombatant />
        </div>

        <div
          data-testid="turn-manager"
          style={{
            width: "250px",
            flexShrink: 0,
            borderLeft: "1px solid var(--border)",
            background: "var(--panel)",
            overflowY: "auto",
          }}
        >
          <TurnManager />
        </div>
      </div>
    </div>
  );
}
