import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EncounterScreen } from "../src/components/EncounterScreen.js";
import { useEncounter } from "../src/state/store.js";

// jsdom does no real layout — it can't measure whether the centre pane
// actually goes to zero width at 590px+ of fixed columns, or whether the
// narrow layout's pinned bottom bar actually clears its content below it in
// a real browser. What follows pins the *structural* contract instead: which
// panes are mounted, that exactly one NextButton exists no matter which tab
// is active, and that the badge/tap-to-open wiring reaches the right store
// actions — not pixels. A previous layout bug reached the user precisely
// because no headless test can measure overlap; this file's tests are a
// deliberately narrower promise than "looks right on a phone".

/** Stubs `window.matchMedia` so useMediaQuery resolves to `narrow` for every
 * query. jsdom (this suite's environment) doesn't implement matchMedia at
 * all — every *other* test file in this repo relies on that absence making
 * useMediaQuery fall back to `false` (desktop), so only this file stubs it. */
function stubMatchMedia(narrow: boolean): void {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockImplementation((query: string) => ({
      matches: narrow,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
}

const add = (name: string, init: number, over: Record<string, unknown> = {}): string =>
  useEncounter.getState().addCombatant(
    { kind: "creature", name, level: 1, ac: 15,
      saves: { fortitude: 5, reflex: 5, will: 5 },
      hp: { current: 20, max: 20 }, ...over },
    init,
  );

describe("EncounterScreen narrow layout", () => {
  beforeEach(() => useEncounter.getState().reset());
  afterEach(() => vi.unstubAllGlobals());

  it("above the breakpoint, still renders all three panes at once with no tab bar", () => {
    stubMatchMedia(false);
    add("Alpha", 20);
    render(<EncounterScreen />);

    expect(screen.getByTestId("combatant-list")).toBeDefined();
    expect(screen.getByTestId("active-combatant")).toBeDefined();
    expect(screen.getByTestId("turn-manager")).toBeDefined();
    expect(screen.queryByRole("tablist")).toBeNull();
  });

  it("below the breakpoint, shows one pane at a time and switches on tap", async () => {
    const user = userEvent.setup();
    stubMatchMedia(true);
    add("Alpha", 20);
    render(<EncounterScreen />);

    // List is the default tab.
    expect(screen.getByTestId("combatant-list")).toBeDefined();
    expect(screen.queryByTestId("active-combatant")).toBeNull();
    expect(screen.queryByTestId("turn-manager")).toBeNull();

    await user.click(screen.getByRole("tab", { name: /active/i }));
    expect(screen.queryByTestId("combatant-list")).toBeNull();
    expect(screen.getByTestId("active-combatant")).toBeDefined();
    expect(screen.queryByTestId("turn-manager")).toBeNull();

    await user.click(screen.getByRole("tab", { name: /turn/i }));
    expect(screen.queryByTestId("combatant-list")).toBeNull();
    expect(screen.queryByTestId("active-combatant")).toBeNull();
    expect(screen.getByTestId("turn-manager")).toBeDefined();
  });

  it("keeps exactly one Next button, pinned, no matter which tab is active", async () => {
    const user = userEvent.setup();
    stubMatchMedia(true);
    add("Alpha", 20);
    render(<EncounterScreen />);

    for (const tabName of [/list/i, /active/i, /turn/i]) {
      await user.click(screen.getByRole("tab", { name: tabName }));
      expect(screen.getAllByRole("button", { name: /next combatant/i })).toHaveLength(1);
    }

    // Pressing it still advances the turn, same as desktop.
    add("Beta", 10);
    await user.click(screen.getByRole("button", { name: /next combatant/i }));
    expect(useEncounter.getState().encounter.activeEntryIndex).toBe(1);
  });

  it("badges the Turn tab with the unacknowledged prompt count", async () => {
    const user = userEvent.setup();
    stubMatchMedia(true);
    const id = add("Alpha", 20);
    useEncounter.getState().addCondition(id, "dying", 1);
    render(<EncounterScreen />);

    expect(screen.getByRole("tab", { name: /1 unacknowledged/i })).toBeDefined();

    // The pinned NextButton (visible on every tab) shows the same count.
    expect(screen.getByText(/1 unacknowledged/i)).toBeDefined();

    // Acknowledging it (via the Turn tab's own prompt card) clears the badge.
    await user.click(screen.getByRole("tab", { name: /turn/i }));
    await user.click(screen.getByRole("button", { name: /got it/i }));
    expect(screen.queryByRole("tab", { name: /unacknowledged/i })).toBeNull();
  });

  it("opens the row popover on tap, and damage can be applied through it", async () => {
    const user = userEvent.setup();
    stubMatchMedia(true);
    const id = add("Alpha", 20);
    render(<EncounterScreen />);

    const list = within(screen.getByTestId("combatant-list"));
    expect(screen.queryByLabelText("amount")).toBeNull();

    await user.click(list.getByText("Alpha"));
    const amount = screen.getByLabelText("amount");
    await user.clear(amount);
    await user.type(amount, "5");
    await user.click(screen.getByRole("button", { name: "Damage" }));

    expect(useEncounter.getState().encounter.combatants[id]!.hp!.current).toBe(15);
  });

  it("targets through the popover's explicit Target control, not the row tap, on a narrow screen", async () => {
    const user = userEvent.setup();
    stubMatchMedia(true);
    add("Alpha", 20);
    add("Bandit", 10);
    render(<EncounterScreen />);

    const list = within(screen.getByTestId("combatant-list"));
    await user.click(list.getByText("Bandit"));
    // Tapping the row only opens its popover — it must not also set the
    // target the way the desktop row-click does.
    expect(useEncounter.getState().encounter.targetId).toBeNull();

    await user.click(screen.getByRole("button", { name: "Target" }));
    expect(useEncounter.getState().encounter.targetId).not.toBeNull();
  });

  it("dismisses the popover by tapping the backdrop", async () => {
    const user = userEvent.setup();
    stubMatchMedia(true);
    add("Alpha", 20);
    render(<EncounterScreen />);

    const list = within(screen.getByTestId("combatant-list"));
    await user.click(list.getByText("Alpha"));
    expect(screen.getByLabelText("amount")).toBeDefined();

    // Click the Close control inside the popover.
    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByLabelText("amount")).toBeNull();
  });
});
