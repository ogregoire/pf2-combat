import { beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EncounterScreen } from "../src/components/EncounterScreen.js";
import { useEncounter } from "../src/state/store.js";

describe("EncounterScreen", () => {
  beforeEach(() => useEncounter.getState().reset());

  it("renders all three panes", () => {
    useEncounter.getState().addCombatant(
      { kind: "creature", name: "The Stag Lord", level: 6, ac: 23,
        saves: { fortitude: 15, reflex: 16, will: 9 },
        hp: { current: 78, max: 110 } },
      19,
    );
    render(<EncounterScreen />);
    expect(screen.getByTestId("combatant-list")).toBeDefined();
    expect(screen.getByTestId("active-combatant")).toBeDefined();
    expect(screen.getByTestId("turn-manager")).toBeDefined();
  });

  it("shows the XP award, which does not change with party size", () => {
    useEncounter.getState().setPlayers([
      { id: "p1", name: "A", level: 4, ac: 20, saves: { fortitude: 9, reflex: 9, will: 9 }, present: true },
      { id: "p2", name: "B", level: 4, ac: 20, saves: { fortitude: 9, reflex: 9, will: 9 }, present: true },
    ]);
    useEncounter.getState().addCombatant(
      { kind: "creature", name: "The Stag Lord", level: 6, ac: 23,
        saves: { fortitude: 15, reflex: 16, will: 9 },
        hp: { current: 110, max: 110 } },
      19,
    );
    render(<EncounterScreen />);
    expect(screen.getByText(/80/)).toBeDefined();
    expect(screen.getByText(/XP each/i)).toBeDefined();
  });

  it("runs a whole turn end to end", async () => {
    const user = userEvent.setup();
    const a = useEncounter.getState().addCombatant(
      { kind: "creature", name: "Alpha", level: 1, ac: 15,
        saves: { fortitude: 5, reflex: 5, will: 5 }, hp: { current: 20, max: 20 } },
      20,
    );
    useEncounter.getState().addCombatant(
      { kind: "creature", name: "Beta", level: 1, ac: 15,
        saves: { fortitude: 5, reflex: 5, will: 5 }, hp: { current: 20, max: 20 } },
      10,
    );
    render(<EncounterScreen />);

    await user.hover(screen.getByText("Alpha"));
    const amount = screen.getByLabelText("amount");
    await user.clear(amount);
    await user.type(amount, "5");
    await user.click(screen.getByRole("button", { name: "Damage" }));
    expect(useEncounter.getState().encounter.combatants[a]!.hp!.current).toBe(15);

    await user.click(screen.getByRole("button", { name: /next combatant/i }));
    expect(useEncounter.getState().encounter.activeEntryIndex).toBe(1);
  });
});
