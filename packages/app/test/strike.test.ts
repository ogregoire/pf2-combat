import { describe, expect, it } from "vitest";
import { resolveStrike, doubleFormula } from "../src/rules/strike.js";

describe("doubleFormula", () => {
  it("doubles dice count and flat modifier", () => {
    expect(doubleFormula("1d8+5")).toBe("2d8+10");
    expect(doubleFormula("2d6")).toBe("4d6");
    expect(doubleFormula("1d4+1")).toBe("2d4+2");
  });

  it("leaves a bare number doubled", () => {
    expect(doubleFormula("7")).toBe("14");
  });
});

describe("resolveStrike", () => {
  const base = {
    bonus: 15,
    agile: false,
    strikesMade: 0,
    attackerConditions: [],
    targetConditions: [],
    targetAc: 21,
    damage: [{ formula: "1d8+5", type: "slashing" }],
  };

  it("computes the plain case", () => {
    const r = resolveStrike(base);
    expect(r.modifier).toBe(15);
    expect(r.effectiveAc).toBe(21);
    const hit = r.outcomes.find((o) => o.degree === "success")!;
    expect(hit.dieFrom).toBe(6);
    expect(hit.damage).toBe("1d8+5 slashing");
  });

  it("folds the worst status penalty into the modifier once", () => {
    const r = resolveStrike({
      ...base,
      attackerConditions: [
        { slug: "sickened", value: 1 },
        { slug: "frightened", value: 2 },
      ],
    });
    expect(r.modifier).toBe(13);
    expect(r.ledger.suppressed.map((m) => m.source)).toContain("sickened 1");
  });

  it("applies MAP", () => {
    expect(resolveStrike({ ...base, strikesMade: 1 }).modifier).toBe(10);
    expect(resolveStrike({ ...base, strikesMade: 2 }).modifier).toBe(5);
    expect(resolveStrike({ ...base, strikesMade: 1, agile: true }).modifier).toBe(11);
  });

  it("lowers the target's AC when the target is off-guard", () => {
    const r = resolveStrike({
      ...base,
      targetConditions: [{ slug: "off-guard", value: 0 }],
    });
    expect(r.effectiveAc).toBe(19);
    expect(r.outcomes.find((o) => o.degree === "success")!.dieFrom).toBe(4);
  });

  it("doubles damage on a critical hit", () => {
    const crit = resolveStrike(base).outcomes.find(
      (o) => o.degree === "critical-success",
    )!;
    expect(crit.damage).toBe("2d8+10 slashing");
  });

  it("adds precision damage only when its condition is on the target", () => {
    const withPrecision = {
      ...base,
      precision: { formula: "2d6", when: "off-guard" as const },
    };
    expect(
      resolveStrike(withPrecision).outcomes.find((o) => o.degree === "success")!
        .damage,
    ).toBe("1d8+5 slashing");

    const r = resolveStrike({
      ...withPrecision,
      targetConditions: [{ slug: "off-guard", value: 0 }],
    });
    expect(r.outcomes.find((o) => o.degree === "success")!.damage).toBe(
      "1d8+5 slashing + 2d6 precision",
    );
    expect(r.outcomes.find((o) => o.degree === "critical-success")!.damage).toBe(
      "2d8+10 slashing + 4d6 precision",
    );
  });

  it("returns four outcomes in ladder order with no damage on misses", () => {
    const r = resolveStrike(base);
    expect(r.outcomes.map((o) => o.degree)).toEqual([
      "critical-success", "success", "failure", "critical-failure",
    ]);
    expect(r.outcomes[2]!.damage).toBeNull();
    expect(r.outcomes[3]!.damage).toBeNull();
  });
});
