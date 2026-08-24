import { beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TurnManager } from "../src/components/TurnManager.js";
import { useEncounter } from "../src/state/store.js";

const add = (name: string, init: number): string =>
  useEncounter.getState().addCombatant(
    { kind: "creature", name, level: 1, ac: 15,
      saves: { fortitude: 5, reflex: 5, will: 5 },
      hp: { current: 20, max: 20 } },
    init,
  );

describe("TurnManager", () => {
  beforeEach(() => useEncounter.getState().reset());

  it("shows the round and three action pips", () => {
    add("a", 20);
    render(<TurnManager />);
    expect(screen.getByText("1")).toBeDefined();
    expect(screen.getAllByTestId("action-pip")).toHaveLength(3);
  });

  it("reduces the pips when the active combatant is slowed", () => {
    const id = add("a", 20);
    useEncounter.getState().addCondition(id, "slowed", 1);
    render(<TurnManager />);
    expect(screen.getAllByTestId("action-pip-filled")).toHaveLength(2);
  });

  it("renders a start-of-turn prompt with its computation", () => {
    const id = add("a", 20);
    useEncounter.getState().addCondition(id, "dying", 2);
    render(<TurnManager />);
    expect(screen.getByText("Recovery check")).toBeDefined();
    expect(screen.getByText("1d20 flat check vs DC 12")).toBeDefined();
    expect(screen.getByText("DC 10 + dying 2 = 12")).toBeDefined();
  });

  it("decrements frightened when its end-of-turn prompt is acknowledged", async () => {
    const user = userEvent.setup();
    const id = add("a", 20);
    useEncounter.getState().addCondition(id, "frightened", 2);
    render(<TurnManager />);

    await user.click(screen.getByRole("button", { name: /got it/i }));
    expect(useEncounter.getState().encounter.combatants[id]!.conditions).toEqual([
      { slug: "frightened", value: 1, formula: undefined },
    ]);
  });

  it("removes frightened once its value would decrement to zero", async () => {
    const user = userEvent.setup();
    const id = add("a", 20);
    useEncounter.getState().addCondition(id, "frightened", 1);
    render(<TurnManager />);

    await user.click(screen.getByRole("button", { name: /got it/i }));
    expect(useEncounter.getState().encounter.combatants[id]!.conditions).toEqual([]);
  });

  it("clears stunned once its start-of-turn action-loss prompt is acknowledged", async () => {
    const user = userEvent.setup();
    const id = add("a", 20);
    useEncounter.getState().addCondition(id, "stunned", 2);
    render(<TurnManager />);

    await user.click(screen.getByRole("button", { name: /got it/i }));
    expect(useEncounter.getState().encounter.combatants[id]!.conditions).toEqual([]);
  });

  it("dismisses a prompt only on click", async () => {
    const user = userEvent.setup();
    const id = add("a", 20);
    useEncounter.getState().addCondition(id, "slowed", 1);
    render(<TurnManager />);
    expect(screen.getByText(/Lose 1 action/)).toBeDefined();
    await user.click(screen.getByRole("button", { name: /got it/i }));
    expect(screen.queryByText(/Lose 1 action/)).toBeNull();
  });

  it("keeps Next enabled but shows the outstanding count", () => {
    const id = add("a", 20);
    useEncounter.getState().addCondition(id, "dying", 1);
    render(<TurnManager />);
    const next = screen.getByRole("button", { name: /next combatant/i });
    expect(next.hasAttribute("disabled")).toBe(false);
    expect(screen.getByText(/1 unacknowledged/i)).toBeDefined();
  });

  it("advances the turn when Next is pressed", async () => {
    const user = userEvent.setup();
    add("a", 20);
    add("b", 10);
    render(<TurnManager />);
    await user.click(screen.getByRole("button", { name: /next combatant/i }));
    expect(useEncounter.getState().encounter.activeEntryIndex).toBe(1);
  });

  it("scrolls the reaction list independently", () => {
    add("a", 20);
    render(<TurnManager />);
    const list = screen.getByTestId("reaction-scroll");
    expect(list.style.overflowY).toBe("auto");
  });

  it("constrains its own height so the reaction list is what scrolls, not the whole panel", () => {
    add("a", 20);
    const { container } = render(<TurnManager />);
    const root = container.firstElementChild as HTMLElement;
    // flexGrow + minHeight:0 is what lets the reaction-scroll child's own
    // overflow:auto actually clip instead of the panel just growing taller
    // than its allotted space — see EncounterScreen's matching turn-manager
    // wrapper, which must not itself scroll.
    expect(root.style.flexGrow).toBe("1");
    expect(root.style.minHeight).toBe("0");
  });

  it("excludes a combatant with no known reactions from the ready list", () => {
    add("a", 20); // no `reactions` given — defaults to []
    render(<TurnManager />);
    expect(screen.getByText("0 ready")).toBeDefined();
  });

  it("lets the GM mark a reaction spent, removing it from the ready list", async () => {
    const user = userEvent.setup();
    const id = useEncounter.getState().addCombatant(
      { kind: "creature", name: "Akiros Ismort", level: 3, ac: 18,
        saves: { fortitude: 10, reflex: 8, will: 6 }, hp: { current: 53, max: 53 },
        reactions: [{ name: "No Escape", trigger: "An adjacent foe moves away." }] },
      15,
    );
    render(<TurnManager />);
    expect(screen.getByText("1 ready")).toBeDefined();

    await user.click(screen.getByRole("button", { name: /spent/i }));

    expect(screen.getByText("0 ready")).toBeDefined();
    expect(useEncounter.getState().encounter.combatants[id]!.reactionSpent).toBe(true);
  });

  it("shows the reaction's name and trigger text", () => {
    useEncounter.getState().addCombatant(
      { kind: "creature", name: "Akiros Ismort", level: 3, ac: 18,
        saves: { fortitude: 10, reflex: 8, will: 6 }, hp: { current: 53, max: 53 },
        reactions: [{ name: "No Escape", trigger: "An adjacent foe moves away." }] },
      15,
    );
    render(<TurnManager />);
    expect(screen.getByText("No Escape")).toBeDefined();
    expect(screen.getByText(/An adjacent foe moves away\./)).toBeDefined();
  });
});
