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
      { id: "player1", name: "Valeria", level: 4, ac: 21, saves: { fortitude: 10, reflex: 12, will: 9 }, present: true, initiativeModifier: null },
      { id: "player2", name: "Akiros", level: 4, ac: 19, saves: { fortitude: 12, reflex: 8, will: 6 }, present: true, initiativeModifier: null },
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
      { id: "player1", name: "Valeria", level: 4, ac: 21, saves: { fortitude: 10, reflex: 12, will: 9 }, present: true, initiativeModifier: null },
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
      { id: "player1", name: "Valeria", level: 4, ac: 21, saves: { fortitude: 10, reflex: 12, will: 9 }, present: true, initiativeModifier: null },
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

/**
 * The roster is `Player.initiativeModifier`'s only writable home: the row
 * popover only ever shows it as a reminder beside the initiative field, and
 * never writes it back (that field commits exactly what's typed, unmodified
 * — see RowPopover.tsx's commitInitiative). A GM who fat-fingered +50 had no
 * way back short of deleting the player and rebuilding them. The roster is
 * where a player's permanent numbers live, so the correction belongs here,
 * beside AC and the saves — the modifier only, not the per-fight initiative
 * roll (that stays in Quick add and the row popover).
 */
describe("PartyManager initiative modifier", () => {
  beforeEach(() => useEncounter.getState().reset());

  const player = (initiativeModifier: number | null) => ({
    id: "player1", name: "Valeria", level: 4, ac: 21,
    saves: { fortitude: 10, reflex: 12, will: 9 }, present: true, initiativeModifier,
  });
  const modifierOf = (): number | null => useEncounter.getState().players[0]!.initiativeModifier;

  it("shows the saved modifier so the GM can see what was entered", () => {
    useEncounter.getState().setPlayers([player(5)]);
    render(<PartyManager />);
    expect((screen.getByLabelText("Initiative modifier") as HTMLInputElement).value).toBe("5");
  });

  // The other half of the null/0 distinction: a stored 0 is a real +0 and
  // must read back as "0". Blanking it (which is what the sibling fields do
  // with a 0, to keep a fresh player's inputs empty) would show the same
  // thing as "unknown" and invite the GM to retype a value they already set.
  it("shows a stored +0 as 0, not as an empty (unknown) field", () => {
    useEncounter.getState().setPlayers([player(0)]);
    render(<PartyManager />);
    expect((screen.getByLabelText("Initiative modifier") as HTMLInputElement).value).toBe("0");
  });

  it("corrects a fat-fingered modifier", async () => {
    const user = userEvent.setup();
    useEncounter.getState().setPlayers([player(50)]);
    render(<PartyManager />);

    const field = screen.getByLabelText("Initiative modifier");
    await user.clear(field);
    await user.type(field, "5");

    expect(modifierOf()).toBe(5);
  });

  it("captures a modifier for a player who has none yet", async () => {
    const user = userEvent.setup();
    useEncounter.getState().setPlayers([player(null)]);
    render(<PartyManager />);
    expect((screen.getByLabelText("Initiative modifier") as HTMLInputElement).value).toBe("");

    await user.type(screen.getByLabelText("Initiative modifier"), "7");

    expect(modifierOf()).toBe(7);
  });

  // Unlike the other numeric fields, blank here means "unknown", not 0 —
  // same distinction HP already makes. A 0 would be a real +0 modifier and
  // would show as one in the row popover's reminder, which is exactly the
  // false signal this null/0 distinction exists to avoid.
  it("treats a cleared field as unknown again, not as +0", async () => {
    const user = userEvent.setup();
    useEncounter.getState().setPlayers([player(5)]);
    render(<PartyManager />);

    await user.clear(screen.getByLabelText("Initiative modifier"));

    expect(modifierOf()).toBeNull();
  });

  // jsdom does no layout, so this pins the two declarations rather than the
  // outcome — but the outcome is what they exist for: the eighth field took
  // the row past the width of the drawer it lives in, and with Name free to
  // shrink to 0 it collapsed to a few pixels with its label overlapping
  // LEVEL's. Caught in a browser; jsdom saw nothing wrong.
  it("wraps the player row rather than shrinking the name field to nothing", () => {
    useEncounter.getState().setPlayers([player(5)]);
    render(<PartyManager />);

    const nameLabel = screen.getByLabelText("Name").closest("label")!;
    expect(nameLabel.style.minWidth).toBe("140px");
    expect((nameLabel.parentElement as HTMLElement).style.flexWrap).toBe("wrap");
  });

  // Task 6 deliberately moved adding a player to the encounter into Quick
  // add. This field is the modifier and nothing else.
  it("does not bring back the per-player Initiative field or Add-to-encounter button", () => {
    useEncounter.getState().setPlayers([player(5)]);
    render(<PartyManager />);
    expect(screen.queryByLabelText("Initiative")).toBeNull();
    expect(screen.queryByRole("button", { name: /add to encounter/i })).toBeNull();
  });
});
