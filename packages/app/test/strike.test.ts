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

  it("doubles a negative flat modifier instead of wrapping the formula", () => {
    expect(doubleFormula("1d4-1")).toBe("2d4-2");
  });
});

describe("resolveStrike", () => {
  const base = {
    bonus: 15,
    kind: "melee" as const,
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

  it("lowers a frightened target's effective AC — frightened penalises all checks and DCs", () => {
    const r = resolveStrike({
      ...base,
      targetConditions: [{ slug: "frightened", value: 2 }],
    });
    expect(r.effectiveAc).toBe(19);
  });

  it("lowers a prone target's effective AC through the implied off-guard, not just the declared field", () => {
    const r = resolveStrike({
      ...base,
      targetConditions: [{ slug: "prone", value: 0 }],
    });
    expect(r.effectiveAc).toBe(19);
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

  it("adds the deadly die on a crit, on top of normal doubling", () => {
    const r = resolveStrike({ ...base, traits: ["deadly-d8"] });
    expect(r.outcomes.find((o) => o.degree === "critical-success")!.damage).toBe(
      "3d8+10 slashing",
    );
    // Not on a normal hit.
    expect(r.outcomes.find((o) => o.degree === "success")!.damage).toBe("1d8+5 slashing");
  });

  it("supports a bestiary deadly trait that bakes in a multi-die count, merging same-size dice", () => {
    const r = resolveStrike({
      ...base,
      damage: [{ formula: "4d10+18", type: "piercing" }],
      traits: ["deadly-2d10"],
    });
    expect(r.outcomes.find((o) => o.degree === "critical-success")!.damage).toBe(
      "10d10+36 piercing",
    );
  });

  it("keeps a differently-sized deadly die as a separate term", () => {
    const r = resolveStrike({ ...base, traits: ["deadly-2d10"] });
    expect(r.outcomes.find((o) => o.degree === "critical-success")!.damage).toBe(
      "2d8+10+2d10 slashing",
    );
  });

  it("changes the weapon die to the fatal size and adds one extra die on a crit", () => {
    const r = resolveStrike({ ...base, traits: ["fatal-d10"] });
    // 1d8+5 -> fatal die is d10 (1d10+5) -> doubled (2d10+10) -> +1 extra d10 (3d10+10).
    expect(r.outcomes.find((o) => o.degree === "critical-success")!.damage).toBe(
      "3d10+10 slashing",
    );
    expect(r.outcomes.find((o) => o.degree === "success")!.damage).toBe("1d8+5 slashing");
  });

  it("labels persistent damage and doubles it on a crit", () => {
    const r = resolveStrike({
      ...base,
      damage: [
        { formula: "1d8+5", type: "slashing" },
        { formula: "2d6", type: "fire", category: "persistent" },
      ],
    });
    expect(r.outcomes.find((o) => o.degree === "success")!.damage).toBe(
      "1d8+5 slashing + 2d6 persistent fire",
    );
    expect(r.outcomes.find((o) => o.degree === "critical-success")!.damage).toBe(
      "2d8+10 slashing + 4d6 persistent fire",
    );
  });

  it("labels splash damage and never doubles it on a crit", () => {
    const r = resolveStrike({
      ...base,
      damage: [{ formula: "3", type: "acid", category: "splash" }],
    });
    expect(r.outcomes.find((o) => o.degree === "success")!.damage).toBe("3 splash acid");
    expect(r.outcomes.find((o) => o.degree === "critical-success")!.damage).toBe(
      "3 splash acid",
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
