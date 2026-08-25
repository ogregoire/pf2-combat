import { beforeEach, describe, expect, it } from "vitest";
import { act, render, screen } from "@testing-library/react";
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

  it("refuses to advance the turn while a combatant has no initiative, and says how many", async () => {
    const user = userEvent.setup();
    add("Alpha", 20);
    useEncounter.getState().addCombatant(
      { kind: "creature", name: "Beta", level: 1, ac: 15,
        saves: { fortitude: 5, reflex: 5, will: 5 },
        hp: { current: 20, max: 20 } },
      null,
    );
    render(<TurnManager />);

    const before = useEncounter.getState().encounter.activeEntryIndex;
    await user.click(screen.getByRole("button", { name: /next combatant/i }));

    expect(useEncounter.getState().encounter.activeEntryIndex).toBe(before);
    expect(screen.getByText(/1 combatant has no initiative/i)).toBeDefined();
  });

  it("shows strikes made this turn beside the action pips", () => {
    const id = add("a", 20);
    render(<TurnManager />);
    expect(screen.getByTestId("strikes-this-turn").textContent).toContain("0");
    // Siblings in the turn panel, not off in the actions list.
    expect(screen.getByTestId("strikes-this-turn").parentElement!.contains(screen.getAllByTestId("action-pip")[0]!)).toBe(true);

    act(() => useEncounter.getState().recordStrike(id));
    expect(screen.getByTestId("strikes-this-turn").textContent).toContain("1");
  });

  it("resets a miscounted strike through its own button, the only UI entry point resetStrikes has left", async () => {
    const user = userEvent.setup();
    const id = add("a", 20);
    act(() => {
      useEncounter.getState().recordStrike(id);
      useEncounter.getState().recordStrike(id);
    });
    render(<TurnManager />);
    expect(screen.getByTestId("strikes-this-turn").textContent).toContain("2");

    await user.click(screen.getByRole("button", { name: /reset strikes this turn/i }));

    expect(useEncounter.getState().encounter.combatants[id]!.strikesMade).toBe(0);
    expect(screen.getByTestId("strikes-this-turn").textContent).toContain("0");
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

  // Frightened's decrement is a rule that fires on its own when the turn
  // ends (nextTurn -> applyEndOfTurn, see store.ts and conditions.ts) — it
  // used to be that acknowledging this card was the *only* place the
  // decrement happened, but now that nextTurn does it too, acknowledging
  // must be inert for it (see the "decrements once, not twice" test below
  // for the regression this guards against). It should still behave as a
  // GM's "I've seen this" record, though: the card itself disappears for
  // the rest of the turn once acknowledged (acknowledgedPrompts).
  it("acknowledging the end-of-turn frightened prompt does not itself decrement it, but does dismiss the card", async () => {
    const user = userEvent.setup();
    const id = add("a", 20);
    useEncounter.getState().addCondition(id, "frightened", 2);
    render(<TurnManager />);

    expect(screen.getByText("Frightened decreases")).toBeDefined();
    await user.click(screen.getByRole("button", { name: /got it/i }));

    expect(useEncounter.getState().encounter.combatants[id]!.conditions).toEqual([
      { slug: "frightened", value: 2, formula: undefined },
    ]);
    expect(screen.queryByText("Frightened decreases")).toBeNull();
  });

  it("acknowledging the end-of-turn frightened prompt at value 1 doesn't remove it either — same, removal is nextTurn's job", async () => {
    const user = userEvent.setup();
    const id = add("a", 20);
    useEncounter.getState().addCondition(id, "frightened", 1);
    render(<TurnManager />);

    await user.click(screen.getByRole("button", { name: /got it/i }));
    expect(useEncounter.getState().encounter.combatants[id]!.conditions).toEqual([
      { slug: "frightened", value: 1, formula: undefined },
    ]);
  });

  // The regression this guards against: handleAcknowledge used to mutate
  // frightened's value directly, independently of nextTurn. After wiring
  // applyEndOfTurn into nextTurn, leaving that mutation in place would have
  // decremented frightened twice for a single turn ending — once when the
  // GM clicked "got it" mid-turn, once more when they actually clicked
  // Next. Acknowledging first (as a GM naturally would, reading the queued
  // card before ending the turn) and then ending the turn must still only
  // decrement once.
  it("decrements frightened once, not twice, when its prompt is acknowledged and then the turn ends", async () => {
    const user = userEvent.setup();
    const id = add("a", 20);
    add("b", 10);
    useEncounter.getState().addCondition(id, "frightened", 2);
    render(<TurnManager />);

    await user.click(screen.getByRole("button", { name: /got it/i }));
    await user.click(screen.getByRole("button", { name: /next combatant/i }));

    expect(useEncounter.getState().encounter.combatants[id]!.conditions).toEqual([
      { slug: "frightened", value: 1, formula: undefined },
    ]);
  });

  it("clears stunned once its start-of-turn action-loss prompt is acknowledged, without refunding the actions it took", async () => {
    const user = userEvent.setup();
    const id = add("a", 20);
    useEncounter.getState().addCondition(id, "stunned", 2);
    render(<TurnManager />);

    expect(screen.getAllByTestId("action-pip-filled")).toHaveLength(1); // 3 - stunned 2

    await user.click(screen.getByRole("button", { name: /got it/i }));

    expect(useEncounter.getState().encounter.combatants[id]!.conditions).toEqual([]);
    // The regression this guards: removing the condition alone used to let
    // ActionPips recompute the pool as if stunned had never happened,
    // handing the two lost actions straight back.
    expect(useEncounter.getState().encounter.combatants[id]!.actionsSpent).toBe(2);
    expect(screen.getAllByTestId("action-pip-filled")).toHaveLength(1);
    // Condition is gone, so the pool's own `reasons` no longer mentions
    // stunned — it's actionsSpent alone keeping the pips down now.
    expect(screen.getByText("1 actions")).toBeDefined();
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

  // These two prove the wiring, not just the function: applyEndOfTurn
  // (conditions.ts) existed and was fully tested in isolation before this,
  // but nothing called it — nextTurn advanced the round without ever
  // touching a condition. What matters here is that pressing Next for real
  // (through the same store action the GM's button uses) is what makes
  // frightened tick down and persistent damage land on HP, not that the
  // pure function returns the right object.
  it("fires end-of-turn hooks through Next: frightened decrements and persistent damage lands on HP via the same path applyDamage uses", async () => {
    const user = userEvent.setup();
    const id = add("a", 20); // active entry — its turn is the one ending
    add("b", 10);
    useEncounter.getState().addCondition(id, "frightened", 2);
    useEncounter.getState().addCondition(id, "persistent-damage", 0, "1d6");
    render(<TurnManager />);

    const hpBefore = useEncounter.getState().encounter.combatants[id]!.hp!.current;
    await user.click(screen.getByRole("button", { name: /next combatant/i }));

    const combatant = useEncounter.getState().encounter.combatants[id]!;
    expect(combatant.conditions.find((c) => c.slug === "frightened")!.value).toBe(1);
    // Bounded, not just "> 0" — a real 1d6 roll through the actual store
    // wiring (Math.random, not injected) can only land in [1, 6], and
    // applyDamage's own floor-at-0 means it can't go negative either way.
    const lost = hpBefore - combatant.hp!.current;
    expect(lost).toBeGreaterThanOrEqual(1);
    expect(lost).toBeLessThanOrEqual(6);
  });

  it("removes frightened via Next once it would tick to zero", async () => {
    const user = userEvent.setup();
    const id = add("a", 20);
    add("b", 10);
    useEncounter.getState().addCondition(id, "frightened", 1);
    render(<TurnManager />);

    await user.click(screen.getByRole("button", { name: /next combatant/i }));

    expect(useEncounter.getState().encounter.combatants[id]!.conditions).toEqual([]);
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

  it("clears enemies through a named confirmation, keeping the fight running", async () => {
    const user = userEvent.setup();
    add("a", 20); // creature
    const pc = useEncounter.getState().addCombatant(
      { kind: "pc", name: "Valeria", level: 4, ac: 21,
        saves: { fortitude: 10, reflex: 12, will: 9 }, hp: null },
      15,
    );
    add("b", 10); // creature
    render(<TurnManager />);

    await user.click(screen.getByRole("button", { name: /clear enemies/i }));
    expect(screen.getByText(/clear 2 enemies/i)).toBeDefined();
    expect(Object.keys(useEncounter.getState().encounter.combatants)).toHaveLength(3); // not yet cleared

    await user.click(screen.getByRole("button", { name: /confirm/i }));

    const enc = useEncounter.getState().encounter;
    expect(Object.keys(enc.combatants)).toEqual([pc]);
    expect(enc.round).toBe(1);
  });

  it("cancels clearing enemies without changing anything", async () => {
    const user = userEvent.setup();
    add("a", 20);
    render(<TurnManager />);

    await user.click(screen.getByRole("button", { name: /clear enemies/i }));
    await user.click(screen.getByRole("button", { name: /cancel/i }));

    expect(Object.keys(useEncounter.getState().encounter.combatants)).toHaveLength(1);
  });

  it("resets the encounter to round 1 with no combatants but keeps the players", async () => {
    const user = userEvent.setup();
    useEncounter.getState().setPlayers([
      { id: "player1", name: "Valeria", level: 4, ac: 21, saves: { fortitude: 10, reflex: 12, will: 9 }, present: true, initiativeModifier: null },
    ]);
    add("a", 20);
    add("b", 10);
    render(<TurnManager />);
    await user.click(screen.getByRole("button", { name: /next combatant/i }));

    await user.click(screen.getByRole("button", { name: /reset encounter/i }));
    expect(screen.getByText(/reset the encounter/i)).toBeDefined();
    await user.click(screen.getByRole("button", { name: /confirm/i }));

    const enc = useEncounter.getState().encounter;
    expect(enc.combatants).toEqual({});
    expect(enc.round).toBe(1);
    expect(useEncounter.getState().players).toHaveLength(1);
  });
});
