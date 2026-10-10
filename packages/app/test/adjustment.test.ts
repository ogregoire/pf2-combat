import { beforeEach, describe, expect, it } from "vitest";
import { addToFormula, adjustedLevel, hpDelta } from "../src/rules/adjustment.js";
import { useEncounter } from "../src/state/store.js";

describe("elite/weak rules (GM Core)", () => {
  it("moves the level by one, or two at the low edge", () => {
    expect(adjustedLevel(5, "elite")).toBe(6);
    expect(adjustedLevel(0, "elite")).toBe(2);
    expect(adjustedLevel(-1, "elite")).toBe(1);
    expect(adjustedLevel(5, "weak")).toBe(4);
    expect(adjustedLevel(1, "weak")).toBe(-1);
  });

  it("picks the Hit Point change by printed level", () => {
    expect([1, 2, 4, 5, 19, 20].map((l) => hpDelta(l, "elite"))).toEqual([10, 15, 15, 20, 20, 30]);
    expect([1, 2, 3, 5, 6, 20, 21].map((l) => hpDelta(l, "weak"))).toEqual([-10, -10, -15, -15, -20, -20, -30]);
  });

  it("adds to a damage formula's flat modifier", () => {
    expect(addToFormula("1d8+5", 2)).toBe("1d8+7");
    expect(addToFormula("2d6", -2)).toBe("2d6-2");
    expect(addToFormula("1d4-2", 2)).toBe("1d4");
    expect(addToFormula("1d6+1", -2)).toBe("1d6-1");
    expect(addToFormula("5", 2)).toBe("7");
  });
});

const ogre = {
  kind: "creature" as const, name: "Ogre", level: 3, ac: 17,
  saves: { fortitude: 12, reflex: 6, will: 8 },
  hp: { current: 50, max: 50 },
  initiativeModifier: 7,
  attacks: [
    { name: "Ogre Hook", kind: "melee", bonus: 12, traits: [],
      damage: [{ formula: "1d10+7", type: "piercing", category: null }], effects: [] },
  ],
};

describe("setAdjustment", () => {
  beforeEach(() => useEncounter.getState().reset());
  const get = (id: string) => useEncounter.getState().encounter.combatants[id]!;

  it("makes a creature elite: +2 AC, saves, Perception, attack and damage, HP by level, +1 level", () => {
    const id = useEncounter.getState().addCombatant(ogre, 10);
    useEncounter.getState().setAdjustment(id, "elite");
    const c = get(id);
    expect(c.level).toBe(4);
    expect(c.ac).toBe(19);
    expect(c.saves).toEqual({ fortitude: 14, reflex: 8, will: 10 });
    expect(c.initiativeModifier).toBe(9);
    expect(c.attacks[0]!.bonus).toBe(14);
    expect(c.attacks[0]!.damage[0]!.formula).toBe("1d10+9");
    expect(c.hp).toEqual({ current: 65, max: 65 });
    expect(c.adjustment).toEqual({ kind: "elite", baseLevel: 3 });
  });

  it("keeps damage already taken, and goes from elite to weak to normal back to the printed stats", () => {
    const id = useEncounter.getState().addCombatant(ogre, 10);
    useEncounter.getState().applyDamage(id, 20);
    useEncounter.getState().setAdjustment(id, "elite");
    expect(get(id).hp).toEqual({ current: 45, max: 65 });

    useEncounter.getState().setAdjustment(id, "weak");
    expect(get(id).level).toBe(2);
    expect(get(id).ac).toBe(15);
    expect(get(id).hp).toEqual({ current: 15, max: 35 });

    useEncounter.getState().setAdjustment(id, null);
    const c = get(id);
    expect(c.level).toBe(3);
    expect(c.ac).toBe(17);
    expect(c.saves).toEqual(ogre.saves);
    expect(c.initiativeModifier).toBe(7);
    expect(c.attacks[0]!.bonus).toBe(12);
    expect(c.attacks[0]!.damage[0]!.formula).toBe("1d10+7");
    expect(c.hp).toEqual({ current: 30, max: 50 });
    expect(c.adjustment).toBeUndefined();
  });

  it("moves spell DCs and spell attacks by 2 too", () => {
    const id = useEncounter.getState().addCombatant(
      { ...ogre, spellcasting: [{ name: "Primal Innate Spells", tradition: "primal", preparation: "innate",
        dc: 20, attack: 12, slots: [], focusPoints: null, spells: [] }] },
      10,
    );
    useEncounter.getState().setAdjustment(id, "weak");
    expect(get(id).spellcasting![0]).toMatchObject({ dc: 18, attack: 10 });
    useEncounter.getState().setAdjustment(id, null);
    expect(get(id).spellcasting![0]).toMatchObject({ dc: 20, attack: 12 });
  });

  it("leaves a PC alone", () => {
    const id = useEncounter.getState().addCombatant(
      { kind: "pc", name: "Valeria", level: 4, ac: 21, saves: { fortitude: 10, reflex: 12, will: 9 }, hp: null },
      15,
    );
    useEncounter.getState().setAdjustment(id, "elite");
    expect(get(id).ac).toBe(21);
    expect(get(id).adjustment).toBeUndefined();
  });
});
