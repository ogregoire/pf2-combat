import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ActiveCombatant } from "../src/components/ActiveCombatant.js";
import { RollAssistant } from "../src/components/RollAssistant.js";
import { useEncounter } from "../src/state/store.js";
import type { Combatant } from "../src/state/types.js";

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
    // +15 vs AC 21: critical success needs total >= 31, reached from face 16
    // (total 31) through the natural 20 (total 35) — shown as totals, not
    // die faces.
    expect(screen.getByTestId("outcome-critical-success").textContent).toContain("31-35");
    expect(screen.getByTestId("outcome-success").textContent).toContain("21-30");
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

  // Unaffordable blocks the *spend*, not the reading of it: the card stays
  // pressable so the GM can open an ability they can't currently pay for,
  // and it's the Use button inside that refuses.
  it("disables the Use button for an action the pool cannot afford but keeps the action visible", async () => {
    const user = userEvent.setup();
    const id = useEncounter.getState().addCombatant(stagLord, 19);
    useEncounter.getState().addCondition(id, "slowed", 2);
    render(<ActiveCombatant />);

    const unfair = screen.getByRole("button", { name: /Unfair Aim/ });
    expect(unfair.hasAttribute("disabled")).toBe(false);
    expect(screen.getByText("Unfair Aim")).toBeDefined();

    await user.click(unfair);
    expect(screen.getByRole("button", { name: /^Use / }).hasAttribute("disabled")).toBe(true);
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

/** Builds an attacker/target pair with a single-attack combatant whose
 * attack bonus is `bonus` and a target whose AC is `ac`, then renders
 * `RollAssistant` directly with that attack already selected — bypassing
 * `ActiveCombatant`/`ActionList` (owned by a concurrent rework) entirely,
 * since attack selection there is just a prop RollAssistant itself doesn't
 * care how it arrived. */
function renderLadder(bonus: number, ac: number): void {
  const attackerId = useEncounter.getState().addCombatant(
    { kind: "creature", name: "Attacker", level: 1, ac: 10,
      saves: { fortitude: 0, reflex: 0, will: 0 }, hp: { current: 10, max: 10 },
      attacks: [{ name: "Test Strike", kind: "melee", bonus, traits: [],
        damage: [{ formula: "1d6", type: "bludgeoning", category: null }], effects: [] }] },
    10,
  );
  const targetId = useEncounter.getState().addCombatant(
    { kind: "creature", name: "Target", level: 1, ac,
      saves: { fortitude: 0, reflex: 0, will: 0 }, hp: { current: 10, max: 10 } },
    5,
  );
  const state = useEncounter.getState();
  const combatant = state.encounter.combatants[attackerId]!;
  const target = state.encounter.combatants[targetId]!;
  render(<RollAssistant combatant={combatant} target={target} attack={combatant.attacks[0]!} />);
}

describe("RollAssistant outcome ladder totals", () => {
  beforeEach(() => useEncounter.getState().reset());

  it("shows totals in a real grid, lower-case labels, and no die-face wording", () => {
    renderLadder(15, 21);
    const row = screen.getByTestId("outcome-success");
    expect(row.parentElement?.style.display).toBe("grid");
    expect(screen.getByText("hit")).toBeDefined();
    expect(screen.getByText("critical hit")).toBeDefined();
    expect(screen.getByText("miss")).toBeDefined();
    expect(screen.getByText("critical miss")).toBeDefined();
    expect(screen.queryByText(/nat/i)).toBeNull();
  });

  it("shows success reachable only on a natural 20, coloured green, with critical success unreachable (+2 vs DC 30)", () => {
    renderLadder(2, 30);
    expect(screen.getByTestId("outcome-critical-success").textContent).toContain("—");
    const hit = within(screen.getByTestId("outcome-success")).getByText("22");
    expect(hit.style.color).toBe("var(--ok)");
    expect(screen.getByTestId("outcome-failure").textContent).toContain("21");
    expect(screen.getByTestId("outcome-critical-failure").textContent).toContain("3-20");
    const natOne = within(screen.getByTestId("outcome-critical-failure")).getByText("3");
    expect(natOne.style.color).toBe("var(--danger)");
  });

  it("colours the natural-20 and natural-1 totals wherever they land (+14 vs AC 21)", () => {
    renderLadder(14, 21);
    expect(screen.getByTestId("outcome-critical-success").textContent).toContain("31-34");
    const natTwenty = within(screen.getByTestId("outcome-critical-success")).getByText("34");
    expect(natTwenty.style.color).toBe("var(--ok)");
    expect(screen.getByTestId("outcome-success").textContent).toContain("21-30");
    expect(screen.getByTestId("outcome-failure").textContent).toContain("16-20");
    const natOne = within(screen.getByTestId("outcome-critical-failure")).getByText("15");
    expect(natOne.style.color).toBe("var(--danger)");
  });

  it("drops a would-be critical success to a red plain success on a natural 1 (+50 vs DC 5)", () => {
    renderLadder(50, 5);
    expect(screen.getByTestId("outcome-critical-success").textContent).toContain("52-70");
    const natTwenty = within(screen.getByTestId("outcome-critical-success")).getByText("70");
    expect(natTwenty.style.color).toBe("var(--ok)");
    const natOne = within(screen.getByTestId("outcome-success")).getByText("51");
    expect(natOne.style.color).toBe("var(--danger)");
    expect(screen.getByTestId("outcome-failure").textContent).toContain("—");
    expect(screen.getByTestId("outcome-critical-failure").textContent).toContain("—");
  });
});
