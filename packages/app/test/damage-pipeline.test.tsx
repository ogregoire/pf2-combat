import { beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CombatantList } from "../src/components/CombatantList.js";
import { damageTaken, shieldHardness } from "../src/rules/damageTaken.js";
import { useEncounter } from "../src/state/store.js";

const state = () => useEncounter.getState();
const get = (id: string) => state().encounter.combatants[id]!;
const ogre = {
  kind: "creature" as const, name: "Ogre", level: 3, ac: 17, saves: { fortitude: 12, reflex: 6, will: 5 }, hp: { current: 50, max: 50 },
  iwr: { immunities: [], weaknesses: [], resistances: [{ type: "fire", value: 5, exceptions: [] }] },
};

describe("the damage pipeline", () => {
  beforeEach(() => state().reset());

  it("resistance, then Hardness, then temporary Hit Points, then Hit Points", () => {
    const target = { iwr: ogre.iwr, conditions: [], hp: { current: 50, max: 50, temp: 4 } };
    expect(damageTaken(target, 20, "fire", 5)).toEqual({ afterIwr: 15, hardness: 5, fromTemp: 4, fromHp: 6 });
    expect(damageTaken({ ...target, conditions: [{ slug: "petrified" as const, value: 0 }] }, 6, "slashing")).toEqual({ afterIwr: 6, hardness: 6, fromTemp: 0, fromHp: 0 });
    expect(shieldHardness(["Longsword", "Steel Shield"])).toBe(5);
    expect(shieldHardness(["Buckler"])).toBe(3);
    expect(shieldHardness(["Sturdy Shield (Greater)"])).toBe(15);
    expect(shieldHardness(["Longsword"])).toBeNull();
  });

  it("temporary Hit Points don't stack, soak damage first, and go", () => {
    const id = state().addCombatant(ogre, 10);
    state().setTempHp(id, 5);
    state().setTempHp(id, 3);
    expect(get(id).hp).toEqual({ current: 50, max: 50, temp: 5 });
    state().applyDamage(id, 8);
    expect(get(id).hp).toEqual({ current: 47, max: 50 });
  });

  it("a Shield Block takes the shield's Hardness off and spends the reaction", () => {
    const id = state().addCombatant(ogre, 10);
    state().applyDamage(id, 12, "slashing", 5);
    expect(get(id).hp!.current).toBe(43);
    expect(get(id).reactionSpent).toBe(true);
  });

  it("typed persistent damage meets resistances at the end of the turn", () => {
    const id = state().addCombatant(ogre, 10);
    state().addCombatant({ ...ogre, name: "Goblin" }, 5);
    state().addCondition(id, "persistent-damage", 0, "1d1+7", "fire");
    state().nextTurn();
    expect(get(id).hp!.current).toBe(47); // 8 fire − 5 resistance
    expect(state().endOfTurnReport).toContainEqual(expect.objectContaining({ kind: "persistent-damage", damageType: "fire", rolled: 8 }));
  });

  it("the popover grants temp HP and breaks the damage down", async () => {
    const user = userEvent.setup();
    const id = state().addCombatant(ogre, 10);
    render(<CombatantList />);
    await user.hover(screen.getByText("Ogre"));
    await user.type(screen.getByLabelText("amount"), "6");
    await user.click(screen.getByRole("button", { name: "Temp HP" }));
    expect(get(id).hp!.temp).toBe(6);
    await user.clear(screen.getByLabelText("amount"));
    await user.type(screen.getByLabelText("amount"), "10");
    await user.click(screen.getByRole("button", { name: "Damage" }));
    expect(get(id).hp).toEqual({ current: 46, max: 50 });
    expect(screen.getByText(/50 → 46 \(6 from temp HP\)/)).toBeDefined();
  });
});
