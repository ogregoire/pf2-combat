import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SaveDialog } from "../src/components/SaveDialog.js";
import { basicSaveDamage, degreeFaces, firstDamage } from "../src/rules/saves.js";
import { useEncounter } from "../src/state/store.js";

const state = () => useEncounter.getState();
const goblin = (name: string) => ({
  kind: "creature" as const, name, level: 1, ac: 16, saves: { fortitude: 5, reflex: 7, will: 3 }, hp: { current: 20, max: 20 },
});

describe("save rules", () => {
  it("counts faces per degree, halves and doubles basic damage, reads a spell's damage", () => {
    expect(degreeFaces(7, 20)).toEqual({ "critical-success": 1, success: 7, failure: 9, "critical-failure": 3 });
    expect([basicSaveDamage(15, "critical-success"), basicSaveDamage(15, "success"), basicSaveDamage(15, "failure"), basicSaveDamage(15, "critical-failure")]).toEqual([0, 7, 15, 30]);
    expect(firstDamage("<p>@Damage[(6d6)[fire]] damage, @Check[reflex|basic]</p>")).toEqual({ formula: "6d6", type: "fire" });
  });
});

describe("the saving-throw dialog", () => {
  beforeEach(() => state().reset());

  it("resolves a basic save for each target, conditions applied, and deals the damage", async () => {
    const user = userEvent.setup();
    const caster = state().addCombatant({ kind: "pc", name: "Ezren", level: 3, ac: 18, saves: { fortitude: 6, reflex: 8, will: 10 }, hp: null }, 25);
    const a = state().addCombatant(goblin("Goblin A"), 10);
    const b = state().addCombatant({ ...goblin("Goblin B"), iwr: { immunities: [], weaknesses: [{ type: "fire", value: 3, exceptions: [] }], resistances: [] } }, 9);
    state().addCondition(b, "clumsy", 2); // Reflex +7 → +5
    state().openSaveDialog({ casterId: caster, label: "Fireball", save: "reflex", dc: 20, basic: true, damageFormula: "6d6", damageType: "fire" });
    render(<SaveDialog />);
    const dialog = within(screen.getByRole("dialog", { name: "Saving throw — Fireball" }));
    await user.type(dialog.getByLabelText("Damage"), "20");
    await user.type(dialog.getByLabelText("Goblin A's d20"), "14"); // 21 vs 20: success, half
    await user.type(dialog.getByLabelText("Goblin B's d20"), "14"); // 19: failure, full + weakness
    const results = dialog.getAllByTestId("save-result").map((r) => r.textContent);
    expect(results).toEqual(["success · 10 damage", "failure · 23 damage"]);
    expect(dialog.getAllByTestId("save-row")[1]!.textContent).toContain("+5");
    await user.click(dialog.getByRole("button", { name: "Apply damage (2)" }));
    expect(state().encounter.combatants[a]!.hp!.current).toBe(10);
    expect(state().encounter.combatants[b]!.hp!.current).toBe(0);
    expect(state().saveRequest).toBeNull();
  });
});
