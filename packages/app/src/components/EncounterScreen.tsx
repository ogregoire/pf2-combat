import { useState } from "react";
import type { Creature } from "@pf2/schema";
import type { FetchFn } from "../data/catalog.js";
import { loadCreature } from "../data/creatures.js";
import { useCatalog } from "../hooks/useCatalog.js";
import { encounterXp, partyLevelFor } from "../rules/xp.js";
import { useEncounter } from "../state/store.js";
import { ActiveCombatant } from "./ActiveCombatant.js";
import { AddCombatants } from "./AddCombatants.js";
import { CombatantList } from "./CombatantList.js";
import { PartyManager } from "./PartyManager.js";
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

const headerButtonStyle: React.CSSProperties = {
  fontFamily: "inherit",
  fontSize: "12px",
  padding: "4px 9px",
  borderRadius: "3px",
  border: "1px solid var(--border-strong)",
  background: "var(--panel-raised)",
  color: "var(--text-dim)",
  cursor: "pointer",
};

/** A right-anchored drawer over the whole screen, used for `<AddCombatants>`
 * and `<PartyManager>` — both are "supporting screens" per the design doc,
 * not panes of their own, so they surface on demand rather than taking
 * permanent space from the three-pane layout the mockup specifies. */
function Drawer({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <div style={{ position: "fixed", inset: 0, background: "oklch(0.08 0.01 60 / 0.6)", display: "flex", justifyContent: "flex-end", zIndex: 50 }}>
      <div
        style={{
          width: "min(760px, 100%)",
          height: "100%",
          background: "var(--bg)",
          borderLeft: "1px solid var(--border)",
          padding: "20px 24px",
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: "16px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontFamily: "var(--font-display)", fontSize: "18px", fontWeight: 600 }}>{title}</span>
          <button type="button" aria-label={`Close ${title}`} onClick={onClose} style={headerButtonStyle}>
            Close
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

type DrawerKind = "add" | "party" | null;

/** Assembles Main.dc.html's whole screen: the top bar, the three panes each
 * carrying the `data-testid` its own tests key off, and the "+ Add"/"Party"
 * controls that surface `<AddCombatants>` and `<PartyManager>` in a drawer —
 * without this the deployed app would have no way to put a creature or a
 * player into the encounter. The creature catalog loads once, on mount, via
 * `useCatalog`; `fetchFn`/`loadCreatureFn` are injectable so tests can drive
 * the whole add-a-creature loop against fake data instead of the network. */
export function EncounterScreen({
  fetchFn,
  loadCreatureFn = loadCreature,
}: {
  fetchFn?: FetchFn;
  loadCreatureFn?: (id: string) => Promise<Creature>;
} = {}): React.ReactElement {
  const catalog = useCatalog(fetchFn);
  const [drawer, setDrawer] = useState<DrawerKind>(null);

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
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px 10px" }}>
            <div style={{ fontSize: "11px", letterSpacing: "0.09em", textTransform: "uppercase", color: "var(--text-faint)" }}>
              Initiative
            </div>
            <div style={{ display: "flex", gap: "6px" }}>
              <button type="button" onClick={() => setDrawer("add")} style={headerButtonStyle}>
                + Add
              </button>
              <button type="button" onClick={() => setDrawer("party")} style={headerButtonStyle}>
                Party
              </button>
            </div>
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
            // No overflow here — the panel itself must not scroll as a
            // whole (that would drag the round counter and Next button out
            // of view with it). Height is instead constrained through this
            // flex chain (display:flex + minHeight:0) down to TurnManager,
            // whose own ReactionWatch child is the only part that scrolls.
            display: "flex",
            flexDirection: "column",
            minHeight: 0,
          }}
        >
          <TurnManager />
        </div>
      </div>

      {drawer === "add" && (
        <Drawer title="Add combatants" onClose={() => setDrawer(null)}>
          {catalog.status === "loading" && <p style={{ color: "var(--text-faint)", fontSize: "13px" }}>loading books&hellip;</p>}
          {catalog.status === "error" && (
            <p style={{ color: "var(--danger)", fontSize: "13px" }}>Could not load the creature catalog: {catalog.message}</p>
          )}
          {catalog.status === "ready" && <AddCombatants entries={catalog.entries} loadCreatureFn={loadCreatureFn} />}
        </Drawer>
      )}

      {drawer === "party" && (
        <Drawer title="Party" onClose={() => setDrawer(null)}>
          <PartyManager />
        </Drawer>
      )}
    </div>
  );
}
