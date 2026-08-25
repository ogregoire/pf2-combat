import { useState } from "react";
import type { Creature } from "@pf2/schema";
import type { FetchFn } from "../data/catalog.js";
import { loadCreature } from "../data/creatures.js";
import { useCatalog } from "../hooks/useCatalog.js";
import { NARROW_LAYOUT_QUERY, useMediaQuery } from "../hooks/useMediaQuery.js";
import { encounterXp, partyLevelFor } from "../rules/xp.js";
import { useEncounter } from "../state/store.js";
import { ActiveCombatant } from "./ActiveCombatant.js";
import { AddCombatants } from "./AddCombatants.js";
import { CombatantList } from "./CombatantList.js";
import { NextButton } from "./NextButton.js";
import { PartyManager } from "./PartyManager.js";
import { TurnManager, remainingActionsFor } from "./TurnManager.js";
import { activeCombatantOf, unacknowledgedCountFor } from "./TurnPrompts.js";

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

      <LanguageToggle />
    </div>
  );
}

/** Switches `lang` between English and French. Labeled with the language a
 * click switches TO, not the language currently shown — Tasks 12-14 are
 * what actually render French text; this toggle only sets the remembered
 * preference (see Task 9). */
function LanguageToggle(): React.ReactElement {
  const lang = useEncounter((s) => s.lang);
  const setLang = useEncounter((s) => s.setLang);
  const isFrench = lang === "fr";

  return (
    <button type="button" onClick={() => setLang(isFrench ? "en" : "fr")} style={headerButtonStyle}>
      {isFrench ? "English" : "Français"}
    </button>
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

/** The list pane's "Initiative" title plus its "+ Add"/"Party" controls —
 * factored out so both the desktop three-column layout and the narrow
 * List tab render the exact same header rather than two copies drifting
 * apart. */
function CombatantListHeader({ onAdd, onParty }: { onAdd: () => void; onParty: () => void }): React.ReactElement {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px 10px" }}>
      <div style={{ fontSize: "11px", letterSpacing: "0.09em", textTransform: "uppercase", color: "var(--text-faint)" }}>
        Initiative
      </div>
      <div style={{ display: "flex", gap: "6px" }}>
        <button type="button" onClick={onAdd} style={headerButtonStyle}>
          + Add
        </button>
        <button type="button" onClick={onParty} style={headerButtonStyle}>
          Party
        </button>
      </div>
    </div>
  );
}

type TabKind = "list" | "active" | "turn";
const TABS: { key: TabKind; label: string }[] = [
  { key: "list", label: "List" },
  { key: "active", label: "Active" },
  { key: "turn", label: "Turn" },
];

/** The narrow layout's List | Active | Turn switcher, replacing the
 * three-column row below the 900px breakpoint (see useMediaQuery.ts for why
 * 900px). The Turn tab carries a badge of the same unacknowledged-prompt
 * count NextButton shows, since that tab can be off-screen exactly when
 * something needs the GM's attention on it. */
function TabBar({
  active,
  onChange,
  turnBadgeCount,
}: {
  active: TabKind;
  onChange: (tab: TabKind) => void;
  turnBadgeCount: number;
}): React.ReactElement {
  return (
    <div
      role="tablist"
      aria-label="Encounter panes"
      style={{ display: "flex", borderBottom: "1px solid var(--border)", background: "var(--panel)", flexShrink: 0 }}
    >
      {TABS.map((tab) => {
        const isActive = tab.key === active;
        return (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(tab.key)}
            style={{
              fontFamily: "inherit",
              flexGrow: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "6px",
              // Comfortably tappable — see the brief's hit-target check.
              padding: "13px 8px",
              fontSize: "13px",
              fontWeight: isActive ? 600 : 400,
              color: isActive ? "var(--text)" : "var(--text-dim)",
              background: isActive ? "var(--panel-raised)" : "transparent",
              border: "none",
              borderBottom: `2px solid ${isActive ? "var(--accent)" : "transparent"}`,
              cursor: "pointer",
            }}
          >
            {tab.label}
            {tab.key === "turn" && turnBadgeCount > 0 && (
              <span
                aria-label={`${turnBadgeCount} unacknowledged`}
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "10.5px",
                  fontWeight: 600,
                  minWidth: "16px",
                  padding: "1px 5px",
                  borderRadius: "999px",
                  background: "var(--accent-bg)",
                  color: "var(--accent-text)",
                  textAlign: "center",
                }}
              >
                {turnBadgeCount}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** Assembles Main.dc.html's whole screen: the top bar, the three panes each
 * carrying the `data-testid` its own tests key off, and the "+ Add"/"Party"
 * controls that surface `<AddCombatants>` and `<PartyManager>` in a drawer —
 * without this the deployed app would have no way to put a creature or a
 * player into the encounter. The creature catalog loads once, on mount, via
 * `useCatalog`; `fetchFn`/`loadCreatureFn` are injectable so tests can drive
 * the whole add-a-creature loop against fake data instead of the network.
 *
 * Below the 900px breakpoint (see useMediaQuery.ts), the three-column row
 * is replaced by List/Active/Turn tabs showing one pane at a time, with a
 * single NextButton pinned to the bottom of the screen regardless of which
 * tab is open — advancing the turn is the most frequent action, so it must
 * never require a tab change. Above the breakpoint this function's output
 * is byte-for-byte what it always was; the narrow branch is purely
 * additive. */
export function EncounterScreen({
  fetchFn,
  loadCreatureFn = loadCreature,
}: {
  fetchFn?: FetchFn;
  loadCreatureFn?: (id: string) => Promise<Creature>;
} = {}): React.ReactElement {
  const catalog = useCatalog(fetchFn);
  const [drawer, setDrawer] = useState<DrawerKind>(null);
  const narrow = useMediaQuery(NARROW_LAYOUT_QUERY);
  const [activeTab, setActiveTab] = useState<TabKind>("list");

  const entries = useEncounter((s) => s.encounter.entries);
  const activeEntryIndex = useEncounter((s) => s.encounter.activeEntryIndex);
  const combatants = useEncounter((s) => s.encounter.combatants);
  const acknowledgedPrompts = useEncounter((s) => s.encounter.acknowledgedPrompts);
  const activeCombatant = activeCombatantOf(entries, activeEntryIndex, combatants);
  const unacknowledgedCount = activeCombatant ? unacknowledgedCountFor(activeCombatant, acknowledgedPrompts) : 0;
  const actionsRemaining = activeCombatant ? remainingActionsFor(activeCombatant) : undefined;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100dvh", background: "var(--bg)", color: "var(--text)" }}>
      <TopBar />

      {narrow ? (
        <>
          <TabBar active={activeTab} onChange={setActiveTab} turnBadgeCount={unacknowledgedCount} />

          {/* jsdom performs no real layout — it can't tell us whether this
             padding actually clears the fixed bottom bar below in a real
             browser. This pins the structure (one pane mounted at a time,
             a single pinned NextButton) rather than pixels. */}
          <div style={{ flexGrow: 1, minHeight: 0, overflowY: "auto", paddingBottom: "88px" }}>
            {activeTab === "list" && (
              <div data-testid="combatant-list" style={{ display: "flex", flexDirection: "column", background: "var(--panel)" }}>
                <CombatantListHeader onAdd={() => setDrawer("add")} onParty={() => setDrawer("party")} />
                <CombatantList
                  quickAddEntries={catalog.status === "ready" ? catalog.entries : []}
                  loadCreatureFn={loadCreatureFn}
                />
              </div>
            )}

            {activeTab === "active" && (
              <div data-testid="active-combatant" style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
                <ActiveCombatant fetchFn={fetchFn} />
              </div>
            )}

            {activeTab === "turn" && (
              <div data-testid="turn-manager" style={{ display: "flex", flexDirection: "column", minHeight: 0, background: "var(--panel)" }}>
                {/* showNextButton=false: the pinned bar below is this
                   layout's single NextButton — TurnManager's own one is
                   desktop-only, so the Turn tab doesn't show two. */}
                <TurnManager showNextButton={false} />
              </div>
            )}
          </div>

          <div
            style={{
              position: "fixed",
              left: 0,
              right: 0,
              bottom: 0,
              padding: "10px 14px",
              background: "var(--panel)",
              borderTop: "1px solid var(--border)",
              zIndex: 40,
            }}
          >
            <NextButton unacknowledgedCount={unacknowledgedCount} actionsRemaining={actionsRemaining} />
          </div>
        </>
      ) : (
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
            <CombatantListHeader onAdd={() => setDrawer("add")} onParty={() => setDrawer("party")} />
            <CombatantList
              quickAddEntries={catalog.status === "ready" ? catalog.entries : []}
              loadCreatureFn={loadCreatureFn}
            />
          </div>

          <div data-testid="active-combatant" style={{ display: "flex", flexGrow: 1, minWidth: 0, minHeight: 0 }}>
            <ActiveCombatant fetchFn={fetchFn} />
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
      )}

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
