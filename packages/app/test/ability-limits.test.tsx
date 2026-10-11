import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ActiveCombatant } from "../src/components/ActiveCombatant.js";
import { abilityLimit, rechargeFormula } from "../src/rules/abilityLimits.js";
import { renderMarkers } from "../src/rules/renderMarkers.js";
import { useEncounter } from "../src/state/store.js";

const breath = {
  name: "Breath Weapon", cost: "2", traits: ["arcane", "fire"], frequency: null, trigger: null, requirements: null, category: "offensive",
  description: "<p>The dragon breathes fire. It can't use Breath Weapon again for [[/gmr 1d4 #Recharge Breath Weapon]]{1d4 rounds}.</p>",
};
const roar = {
  name: "Frightful Roar", cost: "1", traits: [], frequency: { max: 1, per: "round" }, trigger: null, requirements: null, category: "offensive",
  description: "<p>Roars.</p>",
};
const ferocity = {
  name: "Rally", cost: "free", traits: [], frequency: { max: 1, per: "day" }, trigger: null, requirements: null, category: "offensive",
  description: "<p>Rallies.</p>",
};
const add = (): string =>
  useEncounter.getState().addCombatant(
    { kind: "creature", name: "Dragon", level: 8, ac: 27, saves: { fortitude: 17, reflex: 14, will: 15 }, hp: { current: 150, max: 150 },
      actions: [breath, roar, ferocity] },
    20,
  );
const state = () => useEncounter.getState();
const card = (name: string) => within(screen.getAllByRole("button").find((b) => b.getAttribute("aria-pressed") !== null && b.textContent!.includes(name))!);

describe("ability limits", () => {
  beforeEach(() => state().reset());

  it("reads recharges and frequencies", () => {
    expect(rechargeFormula(breath.description)).toBe("1d4");
    expect(rechargeFormula("<p>It can't use Spray again for 2 rounds.</p>")).toBe("2");
    expect(rechargeFormula("<p>Bites.</p>")).toBeNull();
    expect(abilityLimit(roar)).toEqual({ max: 1, per: "round", resetsEachTurn: true });
    expect(abilityLimit(ferocity)?.resetsEachTurn).toBe(false);
    expect(renderMarkers(breath.description)).toBe("<p>The dragon breathes fire. It can't use Breath Weapon again for 1d4 rounds.</p>");
  });

  it("a recharging ability is blocked until its round, then reported ready", () => {
    const id = add();
    state().addCombatant({ kind: "creature", name: "Goblin", level: 1, ac: 16, saves: { fortitude: 5, reflex: 7, will: 3 }, hp: { current: 6, max: 6 } }, 10);
    state().useAbility(id, "Breath Weapon", { counted: false, recharge: "1d4" }, () => 0.5); // rolls 3
    expect(state().encounter.combatants[id]!.cooldowns).toEqual({ "Breath Weapon": { readyRound: 4, rolled: 3 } });
    for (let i = 0; i < 4; i++) state().nextTurn(); // round 3, dragon's turn: still recharging
    expect(state().encounter.round).toBe(3);
    expect(state().encounter.combatants[id]!.cooldowns!["Breath Weapon"]).toBeDefined();
    state().dismissEndOfTurnReport();
    state().nextTurn();
    state().nextTurn(); // round 4, dragon's turn starts: ready
    expect(state().encounter.combatants[id]!.cooldowns).toEqual({});
    expect(state().endOfTurnReport).toContainEqual(expect.objectContaining({ kind: "recharged", ability: "Breath Weapon" }));
  });

  it("counts limited uses on the card, gives a 1/round back each turn, and can take a use back", async () => {
    const user = userEvent.setup();
    const id = add();
    render(<ActiveCombatant />);
    await user.click(card("Frightful Roar").getByText("Frightful Roar"));
    expect(card("Frightful Roar").getByTestId("ability-limit").textContent).toBe("1/1 per round");
    await user.click(card("Frightful Roar").getByRole("button", { name: /Use 1 action/ }));
    expect(card("Frightful Roar").getByTestId("ability-limit").textContent).toBe("0/1 per round");
    expect((card("Frightful Roar").getByRole("button", { name: /Use 1 action/ }) as HTMLButtonElement).disabled).toBe(true);
    await user.click(card("Frightful Roar").getByRole("button", { name: "Take back the use of Frightful Roar" }));
    expect(card("Frightful Roar").getByTestId("ability-limit").textContent).toBe("1/1 per round");

    state().useAbility(id, "Frightful Roar", { counted: true, recharge: null });
    state().useAbility(id, "Rally", { counted: true, recharge: null });
    state().nextTurn(); // alone: the dragon's turn again, next round
    expect(state().encounter.combatants[id]!.abilityUses).toEqual({ Rally: 1 });
  });

  it("shows a recharging ability's ready round", async () => {
    const user = userEvent.setup();
    add();
    render(<ActiveCombatant />);
    await user.click(card("Breath Weapon").getByText("Breath Weapon"));
    await user.click(card("Breath Weapon").getByRole("button", { name: /Use 2 actions/ }));
    expect(card("Breath Weapon").getByTestId("ability-cooldown").textContent).toMatch(/^Recharging: ready round [2-5] \(rolled [1-4]\)$/);
  });
});
