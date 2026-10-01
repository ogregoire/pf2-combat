import { beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PartyManager } from "../src/components/PartyManager.js";
import { useEncounter } from "../src/state/store.js";
import type { Player } from "../src/state/types.js";

describe("PartyManager clear characters", () => {
  beforeEach(() => useEncounter.getState().reset());

  it("has nothing to clear with an empty roster", () => {
    render(<PartyManager />);
    expect(screen.getByRole("button", { name: /clear characters/i }).hasAttribute("disabled")).toBe(true);
  });

  it("asks for confirmation naming the player count before clearing", async () => {
    const user = userEvent.setup();
    useEncounter.getState().setPlayers([
      { id: "player1", name: "Valeria", level: 4, ac: 21, saves: { fortitude: 10, reflex: 12, will: 9 }, present: true, initiativeModifier: null },
      { id: "player2", name: "Akiros", level: 4, ac: 19, saves: { fortitude: 12, reflex: 8, will: 6 }, present: true, initiativeModifier: null },
    ]);
    render(<PartyManager />);

    await user.click(screen.getByRole("button", { name: /clear characters/i }));
    expect(screen.getByText(/clear 2 player characters/i)).toBeDefined();
    expect(useEncounter.getState().players).toHaveLength(2); // not yet cleared

    await user.click(screen.getByRole("button", { name: /confirm/i }));
    expect(useEncounter.getState().players).toEqual([]);
  });

  it("does nothing when the confirmation is cancelled", async () => {
    const user = userEvent.setup();
    useEncounter.getState().setPlayers([
      { id: "player1", name: "Valeria", level: 4, ac: 21, saves: { fortitude: 10, reflex: 12, will: 9 }, present: true, initiativeModifier: null },
    ]);
    render(<PartyManager />);

    await user.click(screen.getByRole("button", { name: /clear characters/i }));
    await user.click(screen.getByRole("button", { name: /cancel/i }));
    expect(useEncounter.getState().players).toHaveLength(1);
    expect(screen.queryByText(/clear 1 player character\?/i)).toBeNull();
  });

  it("also removes any of those players already sitting in the initiative order", async () => {
    const user = userEvent.setup();
    useEncounter.getState().setPlayers([
      { id: "player1", name: "Valeria", level: 4, ac: 21, saves: { fortitude: 10, reflex: 12, will: 9 }, present: true, initiativeModifier: null },
    ]);
    const pcId = useEncounter.getState().addCombatant(
      { kind: "pc", name: "Valeria", level: 4, ac: 21, saves: { fortitude: 10, reflex: 12, will: 9 }, hp: null },
      15,
    );
    render(<PartyManager />);

    await user.click(screen.getByRole("button", { name: /clear characters/i }));
    await user.click(screen.getByRole("button", { name: /confirm/i }));

    expect(useEncounter.getState().encounter.combatants[pcId]).toBeUndefined();
  });
});

describe("PartyManager row", () => {
  beforeEach(() => useEncounter.getState().reset());

  const player = (): Player => ({
    id: "player1", name: "Valeria", level: 4, ac: 21, hp: 38,
    saves: { fortitude: 10, reflex: 12, will: 9 }, present: true, initiativeModifier: null,
  });

  it("shows every value as text, with no input open, until a field is clicked", () => {
    useEncounter.getState().setPlayers([player()]);
    render(<PartyManager />);
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.getByText("Valeria")).toBeDefined();
    expect(screen.getByRole("img", { name: "AC 21" })).toBeDefined();
    expect(screen.getByText("+10")).toBeDefined();
    expect(screen.getByText("+12")).toBeDefined();
    expect(screen.getByText("+9")).toBeDefined();
  });

  it("opens one input on click, edits it, and closes it on Escape", async () => {
    const user = userEvent.setup();
    useEncounter.getState().setPlayers([player()]);
    render(<PartyManager />);

    await user.click(screen.getByRole("button", { name: "AC" }));
    const field = screen.getByRole("textbox", { name: "AC" });
    expect(screen.getAllByRole("textbox")).toHaveLength(1);
    await user.clear(field);
    await user.type(field, "23");
    expect(useEncounter.getState().players[0]!.ac).toBe(23);

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.getByRole("img", { name: "AC 23" })).toBeDefined();
  });

  it("moves to the next field on Enter and back on Shift+Tab", async () => {
    const user = userEvent.setup();
    useEncounter.getState().setPlayers([player()]);
    render(<PartyManager />);

    await user.click(screen.getByRole("button", { name: "Level" }));
    await user.keyboard("{Enter}");
    expect(screen.getByRole("textbox", { name: "HP" })).toBeDefined();
    await user.keyboard("{Shift>}{Tab}{/Shift}");
    expect(screen.getByRole("textbox", { name: "Level" })).toBeDefined();
  });

  it("closes the last field on Enter instead of wrapping around", async () => {
    const user = userEvent.setup();
    useEncounter.getState().setPlayers([player()]);
    render(<PartyManager />);

    await user.click(screen.getByRole("button", { name: "Will" }));
    await user.keyboard("{Enter}");
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  // Players roll their own initiative; the roster only holds the permanent
  // numbers the roll assistant needs. The modifier still exists on the
  // Player record (the row popover's reminder reads it) — it just has no
  // field here any more.
  it("has no initiative modifier field, nor a per-player Initiative or Add-to-encounter control", () => {
    useEncounter.getState().setPlayers([player()]);
    render(<PartyManager />);
    expect(screen.queryByLabelText(/initiative/i)).toBeNull();
    expect(screen.queryByRole("button", { name: /add to encounter/i })).toBeNull();
  });

  // jsdom does no layout, so this pins the declarations rather than the
  // outcome: the three saves sit in one non-wrapping block inside the
  // wrapping field area, so they move to the next line together or not at
  // all, and the bin sits outside that area, vertically centred.
  it("keeps the three saves in one block and the bin outside the wrapping fields", () => {
    useEncounter.getState().setPlayers([player()]);
    render(<PartyManager />);

    const saves = screen.getByTestId("saves-block");
    expect(saves.style.flexWrap).toBe("nowrap");
    const fields = saves.parentElement as HTMLElement;
    expect(fields.style.flexWrap).toBe("wrap");

    const bin = screen.getByRole("button", { name: "Remove Valeria" });
    expect(bin.parentElement).toBe(fields.parentElement);
    expect((bin.parentElement as HTMLElement).style.alignItems).toBe("center");
    expect(bin.style.color).toBe("var(--danger)");
  });

  it("removes the character from the bin", async () => {
    const user = userEvent.setup();
    useEncounter.getState().setPlayers([player()]);
    render(<PartyManager />);
    await user.click(screen.getByRole("button", { name: "Remove Valeria" }));
    expect(useEncounter.getState().players).toEqual([]);
  });
});
