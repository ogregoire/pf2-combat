import { beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PartyManager } from "../src/components/PartyManager.js";
import { useEncounter } from "../src/state/store.js";

describe("PartyManager clear players", () => {
  beforeEach(() => useEncounter.getState().reset());

  it("has nothing to clear with an empty roster", () => {
    render(<PartyManager />);
    expect(screen.getByRole("button", { name: /clear players/i }).hasAttribute("disabled")).toBe(true);
  });

  it("asks for confirmation naming the player count before clearing", async () => {
    const user = userEvent.setup();
    useEncounter.getState().setPlayers([
      { id: "player1", name: "Valeria", level: 4, ac: 21, saves: { fortitude: 10, reflex: 12, will: 9 }, present: true },
      { id: "player2", name: "Akiros", level: 4, ac: 19, saves: { fortitude: 12, reflex: 8, will: 6 }, present: true },
    ]);
    render(<PartyManager />);

    await user.click(screen.getByRole("button", { name: /clear players/i }));
    expect(screen.getByText(/clear 2 players/i)).toBeDefined();
    expect(useEncounter.getState().players).toHaveLength(2); // not yet cleared

    await user.click(screen.getByRole("button", { name: /confirm/i }));
    expect(useEncounter.getState().players).toEqual([]);
  });

  it("does nothing when the confirmation is cancelled", async () => {
    const user = userEvent.setup();
    useEncounter.getState().setPlayers([
      { id: "player1", name: "Valeria", level: 4, ac: 21, saves: { fortitude: 10, reflex: 12, will: 9 }, present: true },
    ]);
    render(<PartyManager />);

    await user.click(screen.getByRole("button", { name: /clear players/i }));
    await user.click(screen.getByRole("button", { name: /cancel/i }));
    expect(useEncounter.getState().players).toHaveLength(1);
    expect(screen.queryByText(/clear 1 player/i)).toBeNull();
  });

  it("also removes any of those players already sitting in the initiative order", async () => {
    const user = userEvent.setup();
    useEncounter.getState().setPlayers([
      { id: "player1", name: "Valeria", level: 4, ac: 21, saves: { fortitude: 10, reflex: 12, will: 9 }, present: true },
    ]);
    const pcId = useEncounter.getState().addCombatant(
      { kind: "pc", name: "Valeria", level: 4, ac: 21, saves: { fortitude: 10, reflex: 12, will: 9 }, hp: null },
      15,
    );
    render(<PartyManager />);

    await user.click(screen.getByRole("button", { name: /clear players/i }));
    await user.click(screen.getByRole("button", { name: /confirm/i }));

    expect(useEncounter.getState().encounter.combatants[pcId]).toBeUndefined();
  });
});
