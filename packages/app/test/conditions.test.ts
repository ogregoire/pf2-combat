import { describe, expect, it, vi } from "vitest";
import { applyEndOfTurn, CONDITIONS, conditionModifiers, type AppliedCondition } from "../src/rules/conditions.js";
import { resolveModifiers } from "../src/rules/modifiers.js";

/** Replays a fixed sequence of [0, 1) values, one per die — see dice.test.ts. */
function fakeRng(values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length]!;
}

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

  it("penalises AC too — frightened/sickened apply to all checks and DCs, and AC is a DC", () => {
    expect(conditionModifiers([{ slug: "frightened", value: 2 }], "ac")).toEqual([
      { value: -2, type: "status", source: "frightened 2" },
    ]);
    expect(conditionModifiers([{ slug: "sickened", value: 1 }], "ac")).toEqual([
      { value: -1, type: "status", source: "sickened 1" },
    ]);
  });

  it("expands prone/grabbed/restrained through `implies` into an off-guard AC penalty", () => {
    expect(conditionModifiers([{ slug: "prone", value: 0 }], "ac")).toEqual([
      { value: -2, type: "circumstance", source: "off-guard" },
    ]);
    expect(conditionModifiers([{ slug: "grabbed", value: 0 }], "ac")).toEqual([
      { value: -2, type: "circumstance", source: "off-guard" },
    ]);
    expect(conditionModifiers([{ slug: "restrained", value: 0 }], "ac")).toEqual([
      { value: -2, type: "circumstance", source: "off-guard" },
    ]);
  });

  it("does not double the off-guard penalty when it's both explicit and implied", () => {
    const mods = conditionModifiers(
      [{ slug: "prone", value: 0 }, { slug: "off-guard", value: 0 }],
      "ac",
    );
    expect(mods).toHaveLength(1);
    expect(mods[0]).toEqual({ value: -2, type: "circumstance", source: "off-guard" });
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

describe("applyEndOfTurn", () => {
  // Verbatim from the task brief — an interface-level smoke test. It only
  // asserts persistentDamage > 0 (default Math.random), which is why the
  // tests below it re-check the same "decrement" and "persistent-damage"
  // hooks with an injected rng for an exact, non-flaky result.
  it("decrements frightened at end of turn and reports persistent damage once", () => {
    const result = applyEndOfTurn([
      { slug: "frightened", value: 2 },
      { slug: "persistent-damage", value: 0, formula: "1d6" },
    ]);
    expect(result.conditions.find((c) => c.slug === "frightened")!.value).toBe(1);
    expect(result.persistentDamage).toBeGreaterThan(0);
  });

  it("removes frightened entirely when it ticks past 0", () => {
    const result = applyEndOfTurn([{ slug: "frightened", value: 1 }]);
    expect(result.conditions.find((c) => c.slug === "frightened")).toBeUndefined();
  });

  it("rolls persistent damage deterministically off an injected rng", () => {
    const result = applyEndOfTurn(
      [{ slug: "persistent-damage", value: 0, formula: "2d6" }],
      fakeRng([0, 0.999999]), // 1 + 6
    );
    expect(result.persistentDamage).toBe(7);
  });

  it("keeps the persistent-damage condition itself after rolling — ending it needs its own DC 15 flat check (see prompts.ts), which this hook does not resolve", () => {
    const result = applyEndOfTurn(
      [{ slug: "persistent-damage", value: 0, formula: "1d6" }],
      () => 0,
    );
    expect(result.conditions).toEqual([{ slug: "persistent-damage", value: 0, formula: "1d6" }]);
  });

  it("sums persistent damage across every persistent-damage condition in one call", () => {
    const result = applyEndOfTurn(
      [
        { slug: "persistent-damage", value: 0, formula: "1d4" },
        { slug: "persistent-damage", value: 0, formula: "1d4" },
      ],
      () => 0, // each rolls its minimum, 1
    );
    expect(result.persistentDamage).toBe(2);
  });

  it("leaves a condition with no endOfTurn hook untouched", () => {
    const result = applyEndOfTurn([{ slug: "sickened", value: 1 }]);
    expect(result.conditions).toEqual([{ slug: "sickened", value: 1 }]);
    expect(result.persistentDamage).toBe(0);
  });

  it("traces (via console.warn) a missing or unparseable persistent-damage formula instead of throwing or silently dealing 0 with no record", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const missing = applyEndOfTurn([{ slug: "persistent-damage", value: 0 }]);
    expect(missing.persistentDamage).toBe(0);

    const bad = applyEndOfTurn([{ slug: "persistent-damage", value: 0, formula: "not-dice" }]);
    expect(bad.persistentDamage).toBe(0);

    expect(warn).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });
});
