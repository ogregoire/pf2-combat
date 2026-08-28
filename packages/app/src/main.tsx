import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles/tokens.css";
import { App } from "./App.js";
import { restorePlayerSequence } from "./components/PartyManager.js";
import { restoreCombatantSequences, useEncounter } from "./state/store.js";
import {
  loadEncounter,
  loadPlayers,
  loadSettings,
  saveEncounter,
  savePlayers,
  saveSettings,
} from "./state/persist.js";

const SAVE_DEBOUNCE_MS = 400;

// Persistence is wired up here, not inside the store module — every test
// that imports the store would otherwise touch IndexedDB just by loading
// it. Load happens once at startup; every later change is saved back after
// a short debounce, so a burst of updates (e.g. addMany) writes once.
let saveTimer: ReturnType<typeof setTimeout> | undefined;

function scheduleSave(): void {
  if (saveTimer !== undefined) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const state = useEncounter.getState();
    void saveEncounter(state.encounter);
    void savePlayers(state.players);
    void saveSettings({ lang: state.lang });
  }, SAVE_DEBOUNCE_MS);
}

/**
 * Loads persisted state and pushes it into the store — the app's one
 * hydration call site. Extracted (rather than left as main.tsx's own
 * top-level side effect) so a test can drive it directly instead of only
 * ever exercising the individual loaders.
 */
export async function hydrate(): Promise<void> {
  const [encounter, players, settings] = await Promise.all([
    loadEncounter(),
    loadPlayers(),
    loadSettings(),
  ]);
  useEncounter.setState((state) => {
    if (encounter !== null) state.encounter = encounter;
    if (players.length > 0) state.players = players;
    state.lang = settings.lang;
  });
  // The store's own id counters (and PartyManager's) are module-level state
  // that always starts at 0 — without this, the very next add after a
  // reload mints an id that collides with one already restored from
  // IndexedDB. Must run after the state above is set, and before any add.
  if (encounter !== null) restoreCombatantSequences(encounter);
  if (players.length > 0) restorePlayerSequence(players);
  useEncounter.subscribe(scheduleSave);
}

void hydrate();

// Guarded rather than a bare non-null assertion: this module is imported by
// lang.test.tsx to reach `hydrate` directly, and a test's jsdom document has
// no #root element (see index.html, which always has one in the real app).
const rootEl = document.getElementById("root");
if (rootEl !== null) {
  createRoot(rootEl).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
