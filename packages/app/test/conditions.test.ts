import { describe, expect, it } from "vitest";
import { CONDITIONS, conditionModifiers, type AppliedCondition } from "../src/rules/conditions.js";
import { resolveModifiers } from "../src/rules/modifiers.js";

describe("condition catalogue", () => {
  it("covers the curated set", () => {
    expect(Object.keys(CONDITIONS).length).toBeGreaterThanOrEqual(20);
    expect(CONDITIONS["off-guard"].valued).toBe(false);
    expect(CONDITIONS.frightened.valued).toBe(true);
  });

  it("marks the right timing hooks", () => {
    expect(CONDITIONS.slowed.startOfTurn).toBe("reduce-actions");
    expect(CONDITIONS.dying.startOfTurn).toBe("recovery-check");
    expect(CONDITIONS.frightened.endOfTurn).toBe("decrement");
    expect(CONDITIONS["persistent-damage"].endOfTurn).toBe("persistent-damage");
    expect(CONDITIONS.sickened.endOfTurn).toBeUndefined();
  });

  it("does not let blinded imply off-guard, unlike prone", () => {
    expect(CONDITIONS.blinded.implies).toBeUndefined();
    expect(CONDITIONS.prone.implies).toContain("off-guard");
  });

  it("marks persistent damage as not valued — it carries dice, not an integer", () => {
    expect(CONDITIONS["persistent-damage"].valued).toBe(false);
    const applied: AppliedCondition = {
      slug: "persistent-damage",
      value: 0,
      formula: "2d6",
    };
    expect(applied.formula).toBe("2d6");
  });
});

describe("conditionModifiers", () => {
  it("gives off-guard a -2 circumstance penalty to AC only", () => {
    expect(conditionModifiers([{ slug: "off-guard", value: 0 }], "ac")).toEqual([
      { value: -2, type: "circumstance", source: "off-guard" },
    ]);
    expect(conditionModifiers([{ slug: "off-guard", value: 0 }], "melee-attack")).toEqual([]);
  });

  it("applies frightened to every check", () => {
    for (const sel of [
      "melee-attack", "ranged-attack", "fortitude", "reflex", "will", "perception",
    ] as const) {
      expect(conditionModifiers([{ slug: "frightened", value: 2 }], sel)).toEqual([
        { value: -2, type: "status", source: "frightened 2" },
      ]);
    }
  });

  it("does not let sickened and frightened stack — worst status only", () => {
    const mods = conditionModifiers(
      [
        { slug: "sickened", value: 1 },
        { slug: "frightened", value: 2 },
      ],
      "melee-attack",
    );
    expect(resolveModifiers(mods).total).toBe(-2);
  });

  it("applies clumsy to AC and Reflex but not Will", () => {
    const c = [{ slug: "clumsy" as const, value: 2 }];
    expect(conditionModifiers(c, "ac")).toHaveLength(1);
    expect(conditionModifiers(c, "reflex")).toHaveLength(1);
    expect(conditionModifiers(c, "will")).toEqual([]);
  });

  it("applies drained to Fortitude only", () => {
    const c = [{ slug: "drained" as const, value: 1 }];
    expect(conditionModifiers(c, "fortitude")).toHaveLength(1);
    expect(conditionModifiers(c, "reflex")).toEqual([]);
  });

  it("gives prone a -2 circumstance to both melee and ranged attacks", () => {
    expect(conditionModifiers([{ slug: "prone", value: 0 }], "melee-attack")).toEqual([
      { value: -2, type: "circumstance", source: "prone" },
    ]);
    expect(conditionModifiers([{ slug: "prone", value: 0 }], "ranged-attack")).toEqual([
      { value: -2, type: "circumstance", source: "prone" },
    ]);
  });

  it("applies fatigued to AC and every save", () => {
    const c = [{ slug: "fatigued" as const, value: 0 }];
    expect(conditionModifiers(c, "ac")).toHaveLength(1);
    expect(conditionModifiers(c, "will")).toHaveLength(1);
    expect(conditionModifiers(c, "melee-attack")).toEqual([]);
  });

  it("splits the attack selector: enfeebled penalises melee only", () => {
    const c = [{ slug: "enfeebled" as const, value: 2 }];
    expect(conditionModifiers(c, "melee-attack")).toHaveLength(1);
    expect(conditionModifiers(c, "ranged-attack")).toEqual([]);
  });

  it("splits the attack selector: clumsy penalises ranged only", () => {
    const c = [{ slug: "clumsy" as const, value: 2 }];
    expect(conditionModifiers(c, "ranged-attack")).toHaveLength(1);
    expect(conditionModifiers(c, "melee-attack")).toEqual([]);
  });

  it("frightened penalises both melee and ranged attacks", () => {
    const c = [{ slug: "frightened" as const, value: 2 }];
    expect(conditionModifiers(c, "melee-attack")).toHaveLength(1);
    expect(conditionModifiers(c, "ranged-attack")).toHaveLength(1);
  });

  it("returns modifiers sorted deterministically", () => {
    const mods = conditionModifiers(
      [
        { slug: "frightened", value: 1 },
        { slug: "fatigued", value: 0 },
      ],
      "will",
    );
    expect(mods.map((m) => m.source)).toEqual(["fatigued", "frightened 1"]);
  });
});
