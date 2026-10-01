import { useState } from "react";
import type { Creature } from "@pf2/schema";
import type { FetchFn } from "../data/catalog.js";
import { loadCreature } from "../data/creatures.js";
import { useCatalog } from "../hooks/useCatalog.js";
import { NARROW_LAYOUT_QUERY, useMediaQuery } from "../hooks/useMediaQuery.js";
import { format, useT } from "../i18n/index.js";
import { encounterXp, partyLevelFor } from "../rules/xp.js";
import { unrolledCount, useEncounter } from "../state/store.js";
import { ActiveCombatant } from "./ActiveCombatant.js";
import { AddCombatants } from "./AddCombatants.js";
import { CombatantList } from "./CombatantList.js";
import { NextButton } from "./NextButton.js";
import { AppMenu } from "./AppMenu.js";
import { PartyManager } from "./PartyManager.js";
import { TurnManager, UnrolledNotice, remainingActionsFor } from "./TurnManager.js";
import { activeCombatantOf, unacknowledgedCountFor } from "./TurnPrompts.js";

/** Main.dc.html's top bar: encounter name, two XP readouts, and the
 * present/party-level readout. Difficulty badges are out of scope for phase 1
 * and are deliberately not built here.
 *
 * The two XP figures answer different questions and were previously conflated
 * into one ambiguous "XP each" badge:
 *
 * - **On the table** — the sum of every creature in the encounter, defeated or
 *   not. This is what the fight is worth in total, i.e. the figure the GM
 *   weighs against an encounter budget when judging difficulty.
 * - **Earned** — the same sum restricted to creatures actually defeated. XP is
 *   awarded for adversaries the party *overcomes* (GM Core, Experience
 *   Points), so a creature that flees or is left standing pays nothing. This
 *   is what each character banks when the fight ends, and it climbs as
 *   creatures fall until it meets the total.
 *
 * Both are per-character amounts, and neither is divided by party size: GM
 * Core is explicit that "each character gains XP equal to the total XP of the
 * creatures and hazards in the encounter", and that adjusting an encounter's
 * *budget* for a party larger or smaller than four changes the difficulty, not
 * the payout. Party level still matters, since each creature's XP is priced
 * against it. */
/** One XP readout. `tone` is what keeps the pair from reading as the same
 * number twice: the running award takes the green treatment (it is the figure
 * that moves during a fight), while the encounter total stays a muted
 * reference figure beside it. */
function XpBadge({
  value,
  label,
  title,
  testId,
  tone,
}: {
  value: number;
  label: string;
  title: string;
  testId: string;
  tone: "muted" | "award";
}): React.ReactElement {
  const award = tone === "award";
  return (
    <div
      data-testid={testId}
      title={title}
      style={{
        display: "flex",
        alignItems: "baseline",
        gap: "5px",
        padding: "3px 11px 4px",
        borderRadius: "3px",
        background: award ? "var(--ok-bg)" : "var(--panel-raised)",
        border: `1px solid ${award ? "var(--border-strong)" : "var(--border)"}`,
      }}
    >
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "17px",
          fontWeight: 600,
          color: award ? "var(--ok)" : "var(--text-dim)",
        }}
      >
        {value}
      </span>
      <span style={{ fontSize: "10.5px", letterSpacing: "0.06em", color: "var(--text-faint)" }}>{label}</span>
    </div>
  );
}

function TopBar({ onOpenParty }: { onOpenParty: () => void }): React.ReactElement {
  const t = useT();
  const name = useEncounter((s) => s.encounter.name);
  const combatants = useEncounter((s) => s.encounter.combatants);
  const players = useEncounter((s) => s.players);

  const creatures = Object.values(combatants).filter((c) => c.kind === "creature");
  const presentPlayers = players.filter((p) => p.present);
  const partyLevel = partyLevelFor(presentPlayers.map((p) => p.level)).level;
  const totalXp = encounterXp(creatures.map((c) => c.level), partyLevel);
  const earnedXp = encounterXp(
    creatures.filter((c) => c.defeated).map((c) => c.level),
    partyLevel,
  );

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
      <AppMenu onOpenParty={onOpenParty} />

      <div style={{ fontFamily: "var(--font-display)", fontSize: "19px", fontWeight: 600, letterSpacing: "0.01em" }}>
        {name}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <XpBadge
          value={totalXp}
          label={t("XP_TOTAL_LABEL")}
          testId="xp-total"
          title={t("XP_TOTAL_TOOLTIP")}
          tone="muted"
        />
        <XpBadge
          value={earnedXp}
          label={t("XP_EARNED_LABEL")}
          testId="xp-earned"
          title={t("XP_EARNED_TOOLTIP")}
          tone="award"
        />
      </div>

      <div style={{ flexGrow: 1 }} />

      <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px", color: "var(--text-dim)" }}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        </svg>
        <span>{format(t("PRESENT_COUNT"), { present: presentPlayers.length, total: players.length })}</span>
        <span style={{ color: "var(--text-faint)" }}>&mdash;</span>
        <span>{format(t("PARTY_LEVEL_LABEL"), { level: partyLevel })}</span>
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

/** A centred modal over the whole screen, used for `<AddCombatants>` and
 * `<PartyManager>` — both are "supporting screens" per the design doc, not
 * panes of their own, so they surface on demand rather than taking
 * permanent space from the three-pane layout the mockup specifies. The
 * panel itself does not scroll: it is a column, and whichever child wants
 * to scroll (the roster, the catalogue) takes `flex: 1; minHeight: 0`. */
function Drawer({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}): React.ReactElement {
  const t = useT();
  return (
    // A click on the scrim — anywhere outside the panel — closes the drawer,
    // same as the Close button. The panel stops propagation so clicks inside
    // it (including on the gap between its cards) never reach the scrim.
    <div
      data-testid="drawer-scrim"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "var(--scrim)",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        padding: "24px",
        zIndex: 50,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(760px, 100%)",
          maxHeight: "100%",
          background: "var(--bg)",
          border: "1px solid var(--border-strong)",
          borderRadius: "8px",
          boxShadow: "0 16px 48px var(--shadow)",
          padding: "20px 24px",
          display: "flex",
          flexDirection: "column",
          gap: "16px",
          minHeight: 0,
          // Fallback for a child that has no scroll region of its own (the
          // catalogue drawer): the panel scrolls. A child that does (the
          // roster) shrinks to fit instead, and scrolls inside.
          overflowY: "auto",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
          <span style={{ fontFamily: "var(--font-display)", fontSize: "18px", fontWeight: 600 }}>{title}</span>
          <button
            type="button"
            aria-label={format(t("CLOSE_NAME_ARIA"), { name: title })}
            title={t("LABEL_CLOSE")}
            onClick={onClose}
            style={{ ...headerButtonStyle, display: "inline-flex", alignItems: "center", justifyContent: "center", width: "28px", height: "28px", padding: 0 }}
          >
            {/* Two perpendicular strokes: a plain × with right angles, not a glyph. */}
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
              <path d="M2 2l10 10M12 2L2 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

type DrawerKind = "add" | "party" | null;

/** The list pane's "Initiative" title plus its "+ Add" control — factored
 * out so both the desktop three-column layout and the narrow List tab
 * render the exact same header rather than two copies drifting apart. The
 * party roster is reached from the app menu (AppMenu), not from here. */
function CombatantListHeader({ onAdd }: { onAdd: () => void }): React.ReactElement {
  const t = useT();
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px 10px" }}>
      <div style={{ fontSize: "11px", letterSpacing: "0.09em", textTransform: "uppercase", color: "var(--text-faint)" }}>
        {t("LABEL_INITIATIVE")}
      </div>
      <button type="button" onClick={onAdd} style={headerButtonStyle}>
        {t("ADD_SHORT_BUTTON")}
      </button>
    </div>
  );
}

type TabKind = "list" | "active" | "turn";
const TABS: { key: TabKind; labelKey: "TABS_LIST" | "TABS_ACTIVE" | "TABS_TURN" }[] = [
  { key: "list", labelKey: "TABS_LIST" },
  { key: "active", labelKey: "TABS_ACTIVE" },
  { key: "turn", labelKey: "TABS_TURN" },
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
  const t = useT();
  return (
    <div
      role="tablist"
      aria-label={t("TABS_ARIA_LABEL")}
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
              borderBottom: `2px solid ${isActive ? "var(--select)" : "transparent"}`,
              cursor: "pointer",
            }}
          >
            {t(tab.labelKey)}
            {tab.key === "turn" && turnBadgeCount > 0 && (
              <span
                aria-label={format(t("UNACKNOWLEDGED_COUNT"), { n: turnBadgeCount })}
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "10.5px",
                  fontWeight: 600,
                  minWidth: "16px",
                  padding: "1px 5px",
                  borderRadius: "999px",
                  background: "var(--select)",
                  color: "var(--select-text)",
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
  const t = useT();
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
  // Only gates whether the pinned bar reserves space for UnrolledNotice
  // below — the message text itself lives in exactly one place
  // (TurnManager.UnrolledNotice), not duplicated here.
  const unrolled = useEncounter((s) => unrolledCount(s.encounter));

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100dvh", background: "var(--bg)", color: "var(--text)" }}>
      <TopBar onOpenParty={() => setDrawer("party")} />

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
                <CombatantListHeader onAdd={() => setDrawer("add")} />
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
                <TurnManager showNextButton={false} fetchFn={fetchFn} />
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
            {/* Pinned bar is reachable from every tab, so this is the one
               place the guard's reason is guaranteed visible no matter
               which pane the GM is looking at. Guarded on `unrolled` (only
               a count check, not a copy of the message) so the bar doesn't
               reserve this space when there's nothing to say. */}
            {unrolled > 0 && (
              <div style={{ textAlign: "center", marginBottom: "6px" }}>
                <UnrolledNotice />
              </div>
            )}
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
            <CombatantListHeader onAdd={() => setDrawer("add")} />
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
            <TurnManager fetchFn={fetchFn} />
          </div>
        </div>
      )}

      {drawer === "add" && (
        <Drawer title={t("ADD_COMBATANTS_TITLE")} onClose={() => setDrawer(null)}>
          {catalog.status === "loading" && <p style={{ color: "var(--text-faint)", fontSize: "13px" }}>{t("LOADING_BOOKS_MSG")}</p>}
          {catalog.status === "error" && (
            <p style={{ color: "var(--danger)", fontSize: "13px" }}>
              {format(t("CATALOG_ERROR_PREFIX"), { message: catalog.message })}
            </p>
          )}
          {catalog.status === "ready" && <AddCombatants entries={catalog.entries} loadCreatureFn={loadCreatureFn} />}
        </Drawer>
      )}

      {drawer === "party" && (
        <Drawer title={t("PARTY_TITLE")} onClose={() => setDrawer(null)}>
          <PartyManager />
        </Drawer>
      )}
    </div>
  );
}
