import { describe, expect, it } from "vitest";
import { degreeOf, degreeTotalRanges, dieBands } from "../src/rules/degrees.js";

describe("degreeOf", () => {
  it("grades by margin against the DC", () => {
    expect(degreeOf(31, 21)).toBe("critical-success");
    expect(degreeOf(21, 21)).toBe("success");
    expect(degreeOf(20, 21)).toBe("failure");
    expect(degreeOf(12, 21)).toBe("failure");
    // Exactly ten below the DC is a critical failure — symmetric with the
    // ten-above rule for critical success.
    expect(degreeOf(11, 21)).toBe("critical-failure");
    expect(degreeOf(10, 21)).toBe("critical-failure");
  });

  it("raises one step on a natural 20", () => {
    expect(degreeOf(25, 21, 20)).toBe("critical-success");
    expect(degreeOf(15, 21, 20)).toBe("success");
    expect(degreeOf(5, 21, 20)).toBe("failure");
  });

  it("lowers one step on a natural 1", () => {
    expect(degreeOf(31, 21, 1)).toBe("success");
    expect(degreeOf(21, 21, 1)).toBe("failure");
    expect(degreeOf(15, 21, 1)).toBe("critical-failure");
  });

  it("cannot shift past either end of the ladder", () => {
    expect(degreeOf(60, 21, 20)).toBe("critical-success");
    expect(degreeOf(1, 21, 1)).toBe("critical-failure");
  });
});

describe("dieBands", () => {
  it("computes the Stag Lord's longsword at +14 against AC 21", () => {
    const b = dieBands(14, 21);
    expect(b["critical-success"]).toEqual({ from: 17, to: 20 });
    expect(b.success).toEqual({ from: 7, to: 16 });
    expect(b.failure).toEqual({ from: 2, to: 6 });
    expect(b["critical-failure"]).toEqual({ from: 1, to: 1 });
  });

  it("lets a natural 20 succeed where the arithmetic cannot", () => {
    // +2 vs DC 30: a natural 20 totals 22, a failure, which the nat-20 shift
    // raises to a success — but NOT to a critical success.
    const b = dieBands(2, 30);
    expect(b.success).toEqual({ from: 20, to: 20 });
    expect(b["critical-success"]).toBeNull();
    expect(b.failure).toEqual({ from: 19, to: 19 });
  });

  it("reports unreachable degrees as null", () => {
    const b = dieBands(0, 40);
    expect(b["critical-success"]).toBeNull();
    expect(b.success).toBeNull();
    expect(b.failure).toEqual({ from: 20, to: 20 });
    expect(b["critical-failure"]).toEqual({ from: 1, to: 19 });
  });

  it("lets a natural 1 fail where the arithmetic cannot", () => {
    // +50 vs DC 5: every face crits except a natural 1, which drops one step.
    const b = dieBands(50, 5);
    expect(b["critical-success"]).toEqual({ from: 2, to: 20 });
    expect(b.success).toEqual({ from: 1, to: 1 });
    expect(b.failure).toBeNull();
    expect(b["critical-failure"]).toBeNull();
  });

  it("covers all twenty faces exactly once", () => {
    const b = dieBands(7, 18);
    const covered = Object.values(b)
      .filter((x) => x !== null)
      .flatMap((x) => Array.from({ length: x!.to - x!.from + 1 }, (_, i) => x!.from + i));
    expect(covered.sort((p, q) => p - q)).toEqual(
      Array.from({ length: 20 }, (_, i) => i + 1),
    );
  });
});

describe("degreeTotalRanges", () => {
  it("reports success as reachable only on a natural 20, and critical success as never (+2 vs DC 30)", () => {
    // The highest reachable total is 22 (nat 20 + 2), below DC 30 — success
    // only happens because a natural 20 raises a would-be failure one step.
    // Critical success needs total >= 40, which no roll can ever reach, with
    // or without the shift.
    const r = degreeTotalRanges(2, 30);
    expect(r).toEqual([
      { degree: "critical-success", low: null, high: null },
      { degree: "success", low: 22, high: 22 },
      { degree: "failure", low: 21, high: 21 },
      { degree: "critical-failure", low: 3, high: 20 },
    ]);
  });

  it("reports the ordinary spread for the Stag Lord's longsword at +14 against AC 21", () => {
    const r = degreeTotalRanges(14, 21);
    expect(r).toEqual([
      { degree: "critical-success", low: 31, high: 34 },
      { degree: "success", low: 21, high: 30 },
      { degree: "failure", low: 16, high: 20 },
      { degree: "critical-failure", low: 15, high: 15 },
    ]);
  });

  it("drops a would-be critical success to a plain success on a natural 1 (+50 vs DC 5)", () => {
    // Every total from +50 crits arithmetically, but a natural 1 always
    // drops one step, landing total 51 — numerically inside the critical
    // band — as a plain success instead. Failure and critical failure are
    // unreachable: nothing this modifier rolls can total low enough, even
    // shifted.
    const r = degreeTotalRanges(50, 5);
    expect(r).toEqual([
      { degree: "critical-success", low: 52, high: 70 },
      { degree: "success", low: 51, high: 51 },
      { degree: "failure", low: null, high: null },
      { degree: "critical-failure", low: null, high: null },
    ]);
  });
});
