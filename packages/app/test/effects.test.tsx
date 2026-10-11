import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DefenseSummary } from "../src/components/DefenseSummary.js";
import { EffectsSection } from "../src/components/Effects.js";
import { CHECKS } from "../src/rules/conditions.js";
import { modifiersFor } from "../src/rules/effects.js";
import { resolveModifiers } from "../src/rules/modifiers.js";
import { resolveStrike } from "../src/rules/strike.js";
import { useEncounter } from "../src/state/store.js";

const ogre = { kind: "creature" as const, name: "Ogre", level: 3, ac: 17, saves: { fortitude: 12, reflex: 6, will: 5 }, hp: { current: 50, max: 50 } };
const state = () => useEncounter.getState();
const get = (id: string) => state().encounter.combatants[id]!;

describe("bonuses and penalties", () => {
  beforeEach(() => state().reset());

  it("stack with conditions by PF2's rules", () => {
    const id = state().addCombatant(ogre, 10);
    state().addEffect(id, { label: "Cover", value: 2, type: "circumstance", targets: ["ac"] });
    state().addCondition(id, "off-guard", 0);
    // Cover +2 and off-guard −2 are both circumstance: the best bonus and the worst penalty both apply.
    expect(resolveModifiers(modifiersFor(get(id), CHECKS.ac)).total).toBe(0);
    state().addEffect(id, { label: "Heroism", value: 1, type: "status", targets: ["saves"] });
    state().addCondition(id, "frightened", 2);
    expect(resolveModifiers(modifiersFor(get(id), CHECKS.will)).total).toBe(-1);
  });

  it("reach the roll assistant: the target's cover, the attacker's buff to attack and damage", () => {
    const r = resolveStrike({
      bonus: 10, kind: "melee", agile: false, strikesMade: 0, attackerConditions: [], targetConditions: [], targetAc: 20,
      attackerEffects: [{ id: "a", label: "Anthem", value: 1, type: "status", targets: ["attacks", "damage"] }],
      targetEffects: [{ id: "b", label: "Cover", value: 2, type: "circumstance", targets: ["ac"] }],
      damage: [{ formula: "1d8+4", type: "slashing" }],
    });
    expect(r.modifier).toBe(11);
    expect(r.effectiveAc).toBe(22);
    expect(r.outcomes[1]!.damage).toBe("1d8+5 slashing");
  });

  it("are added from the popover — a preset, or one of the GM's own — shown green, and removed", async () => {
    const user = userEvent.setup();
    const id = state().addCombatant(ogre, 10);
    const { rerender } = render(<EffectsSection combatant={get(id)} />);
    await user.click(screen.getByRole("button", { name: "Cover +2" }));
    await user.click(screen.getByRole("button", { name: "Other…" }));
    const form = within(screen.getByTestId("custom-effect"));
    await user.type(form.getByLabelText("Name"), "Sickly");
    await user.clear(form.getByLabelText("Bonus (negative for a penalty)"));
    await user.type(form.getByLabelText("Bonus (negative for a penalty)"), "-1");
    await user.click(form.getByRole("button", { name: "Fortitude" }));
    await user.click(form.getByRole("button", { name: "Add" }));
    expect(get(id).effects!.map((e) => [e.label, e.value, e.type, e.targets])).toEqual([
      ["Cover", 2, "circumstance", ["ac"]],
      ["Sickly", -1, "circumstance", ["fortitude"]],
    ]);
    rerender(<DefenseSummary combatant={get(id)} />);
    expect(screen.getByRole("img", { name: "AC 19" }).querySelector("text")!.getAttribute("fill")).toBe("var(--ok)");
    expect(screen.getByLabelText("Fortitude +11").style.color).toBe("var(--danger)");
  });
});

describe("timed conditions and effects", () => {
  beforeEach(() => state().reset());

  it("end when their duration is up, and the turn-change dialog says so", () => {
    const a = state().addCombatant({ ...ogre, name: "Ogre" }, 20);
    const b = state().addCombatant({ ...ogre, name: "Goblin" }, 10);
    // During the Ogre's turn: the Goblin off-guard until the end of the Ogre's next turn…
    state().addCondition(b, "off-guard", 0);
    state().setExpiry(b, { condition: "off-guard" }, { round: 2, combatantId: a, at: "end" });
    // …and a raised shield on the Ogre until the start of its next turn.
    state().addEffect(a, { label: "Raised shield", value: 2, type: "circumstance", targets: ["ac"], expires: { round: 2, combatantId: a, at: "start" } });
    state().nextTurn(); // Goblin, round 1
    state().nextTurn(); // Ogre, round 2: the shield drops
    expect(get(a).effects).toEqual([]);
    expect(state().endOfTurnReport).toContainEqual(expect.objectContaining({ kind: "expired", name: "Ogre", effect: "Raised shield" }));
    expect(get(b).conditions).toHaveLength(1);
    state().nextTurn(); // the Ogre's turn ends: off-guard ends
    expect(get(b).conditions).toEqual([]);
    expect(state().endOfTurnReport).toContainEqual(expect.objectContaining({ kind: "expired", name: "Goblin", condition: { slug: "off-guard", value: 0 } }));
  });

  it("raised shield lasts until the start of its bearer's next turn", async () => {
    const user = userEvent.setup();
    const id = state().addCombatant(ogre, 10);
    render(<EffectsSection combatant={get(id)} />);
    await user.click(screen.getByRole("button", { name: "Raised shield +2" }));
    expect(get(id).effects![0]!.expires).toEqual({ round: 2, combatantId: id, at: "start" });
  });
});
