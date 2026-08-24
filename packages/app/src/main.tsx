import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles/tokens.css";
import { App } from "./App.js";
import { restorePlayerSequence } from "./components/PartyManager.js";
import { restoreCombatantSequences, useEncounter } from "./state/store.js";
import { loadEncounter, loadPlayers, saveEncounter, savePlayers } from "./state/persist.js";

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
  }, SAVE_DEBOUNCE_MS);
}

Promise.all([loadEncounter(), loadPlayers()]).then(([encounter, players]) => {
  useEncounter.setState((state) => {
    if (encounter !== null) state.encounter = encounter;
    if (players.length > 0) state.players = players;
  });
  // The store's own id counters (and PartyManager's) are module-level state
  // that always starts at 0 — without this, the very next add after a
  // reload mints an id that collides with one already restored from
  // IndexedDB. Must run after the state above is set, and before any add.
  if (encounter !== null) restoreCombatantSequences(encounter);
  if (players.length > 0) restorePlayerSequence(players);
  useEncounter.subscribe(scheduleSave);
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
