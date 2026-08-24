import { describe, expect, it } from "vitest";
import { actionPool } from "../src/rules/actions.js";

describe("actionPool", () => {
  it("is three by default", () => {
    const p = actionPool({ slowed: 0, stunned: 0, quickened: false });
    expect(p.total).toBe(3);
    expect(p.lost).toBe(0);
  });

  it("loses actions to slowed", () => {
    const p = actionPool({ slowed: 1, stunned: 0, quickened: false });
    expect(p.total).toBe(2);
    expect(p.reasons).toContain("slowed 1");
  });

  it("takes the larger of slowed and stunned, not both", () => {
    const p = actionPool({ slowed: 1, stunned: 2, quickened: false });
    expect(p.total).toBe(1);
    expect(p.lost).toBe(2);
    expect(p.reasons).toContain("stunned 2");
    expect(p.reasons).not.toContain("slowed 1");
  });

  it("adds one for quickened", () => {
    const p = actionPool({ slowed: 0, stunned: 0, quickened: true });
    expect(p.total).toBe(4);
  });

  it("never drops below zero", () => {
    const p = actionPool({ slowed: 0, stunned: 9, quickened: false });
    expect(p.total).toBe(0);
  });
});
