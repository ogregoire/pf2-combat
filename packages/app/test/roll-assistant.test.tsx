import { beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ActiveCombatant } from "../src/components/ActiveCombatant.js";
import { useEncounter } from "../src/state/store.js";

const stagLord = {
  kind: "creature" as const, name: "The Stag Lord", level: 6, ac: 23,
  saves: { fortitude: 15, reflex: 16, will: 9 },
  hp: { current: 78, max: 110 },
  attacks: [
    { name: "Longsword", kind: "melee", bonus: 15, traits: [],
      damage: [{ formula: "1d8+5", type: "slashing", category: null }], effects: [] },
  ],
  actions: [
    { name: "Hunt Prey", cost: "1", traits: ["concentrate"], frequency: null,
      trigger: null, requirements: null, description: "<p>Designate prey.</p>", category: "offensive" },
    { name: "Unfair Aim", cost: "2", traits: [], frequency: null,
      trigger: null, requirements: null, description: "<p>Line up a shot.</p>", category: "offensive" },
  ],
};

const target = {
  kind: "pc" as const, name: "Valeria", level: 4, ac: 21,
  saves: { fortitude: 10, reflex: 12, will: 9 }, hp: null,
};

describe("RollAssistant", () => {
  beforeEach(() => useEncounter.getState().reset());

  it("shows the MAP ladder with the first bonus active", () => {
    useEncounter.getState().addCombatant(stagLord, 19);
    render(<ActiveCombatant />);
    expect(screen.getByText("+15")).toBeDefined();
    expect(screen.getByText("+10")).toBeDefined();
    expect(screen.getByText("+5")).toBeDefined();
  });

  it("computes the outcome ladder against the selected target", async () => {
    const user = userEvent.setup();
    useEncounter.getState().addCombatant(stagLord, 19);
    const tid = useEncounter.getState().addCombatant(target, 22);
    useEncounter.getState().setTarget(tid);
    render(<ActiveCombatant />);

    await user.click(screen.getByRole("button", { name: /Longsword/ }));
    expect(screen.getByText("1d20 + 15")).toBeDefined();
    expect(screen.getByTestId("outcome-critical-success").textContent).toContain("16");
    expect(screen.getByTestId("outcome-success").textContent).toContain("6");
    expect(screen.getByTestId("outcome-critical-success").textContent).toContain("2d8+10");
  });

  it("folds the worst status penalty into the ledger and shows what was suppressed", async () => {
    const user = userEvent.setup();
    const sid = useEncounter.getState().addCombatant(stagLord, 19);
    const tid = useEncounter.getState().addCombatant(target, 22);
    useEncounter.getState().setTarget(tid);
    useEncounter.getState().addCondition(sid, "sickened", 1);
    useEncounter.getState().addCondition(sid, "frightened", 2);
    render(<ActiveCombatant />);

    await user.click(screen.getByRole("button", { name: /Longsword/ }));
    expect(screen.getByText("1d20 + 13")).toBeDefined();
    expect(screen.getByText(/sickened 1/)).toBeDefined();
  });

  it("disables an action the pool cannot afford but keeps it visible", () => {
    const id = useEncounter.getState().addCombatant(stagLord, 19);
    useEncounter.getState().addCondition(id, "slowed", 2);
    render(<ActiveCombatant />);
    const unfair = screen.getByRole("button", { name: /Unfair Aim/ });
    expect(unfair.hasAttribute("disabled")).toBe(true);
    expect(screen.getByText("Unfair Aim")).toBeDefined();
  });

  it("advances the MAP when a strike is recorded", async () => {
    const user = userEvent.setup();
    const sid = useEncounter.getState().addCombatant(stagLord, 19);
    const tid = useEncounter.getState().addCombatant(target, 22);
    useEncounter.getState().setTarget(tid);
    render(<ActiveCombatant />);

    await user.click(screen.getByRole("button", { name: /Longsword/ }));
    await user.click(screen.getByRole("button", { name: /record strike/i }));
    expect(useEncounter.getState().encounter.combatants[sid]!.strikesMade).toBe(1);
    expect(screen.getByText("1d20 + 10")).toBeDefined();
  });

  it("prompts for a target when none is selected", () => {
    useEncounter.getState().addCombatant(stagLord, 19);
    render(<ActiveCombatant />);
    expect(screen.getByText(/select a target/i)).toBeDefined();
  });
});
