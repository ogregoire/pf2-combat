import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EncounterScreen } from "../src/components/EncounterScreen.js";
import { hydrate } from "../src/main.js";
import { loadSettings, putRawSettings, saveSettings } from "../src/state/persist.js";
import { useEncounter } from "../src/state/store.js";

describe("lang", () => {
  // main.tsx wires saving through `useEncounter.subscribe(scheduleSave)`,
  // set up inside `hydrate()` itself, not eagerly on module import — the
  // "persists" test below needs that subscription active before it runs, so
  // it awaits one full hydration cycle up front rather than racing the
  // unawaited call main.tsx's own module body already makes on import.
  beforeAll(async () => {
    await hydrate();
  });

  beforeEach(() => useEncounter.getState().reset());

  it("defaults to English", () => {
    expect(useEncounter.getState().lang).toBe("en");
  });

  it("setLang switches and persists", async () => {
    useEncounter.getState().setLang("fr");
    expect(useEncounter.getState().lang).toBe("fr");
    await waitFor(async () => expect(await loadSettings()).toEqual({ lang: "fr" }));
  });

  it("round-trips the language through the persistence layer", async () => {
    await saveSettings({ lang: "fr" });
    expect(await loadSettings()).toEqual({ lang: "fr" });
  });

  it("reads a payload saved before lang existed as English", async () => {
    // An existing saved fight must still open.
    await putRawSettings({ schemaVersion: 1 });
    expect((await loadSettings()).lang).toBe("en");
  });

  it("main.tsx applies the loaded language to the store", async () => {
    // Guards the wiring, not the loader.
    await saveSettings({ lang: "fr" });
    await hydrate();
    expect(useEncounter.getState().lang).toBe("fr");
  });

  it("renders a toggle that switches the language", async () => {
    const user = userEvent.setup();
    render(<EncounterScreen />);
    await user.click(screen.getByRole("button", { name: /français/i }));
    expect(useEncounter.getState().lang).toBe("fr");
  });
});
