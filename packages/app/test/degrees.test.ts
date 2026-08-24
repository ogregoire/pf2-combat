import { describe, expect, it } from "vitest";
import { degreeOf, dieBands } from "../src/rules/degrees.js";

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
