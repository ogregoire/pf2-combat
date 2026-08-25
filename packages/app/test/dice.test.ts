import { describe, expect, it } from "vitest";
import { rollFormula } from "../src/rules/dice.js";

/** Replays a fixed sequence of [0, 1) values, one per die rolled, cycling if
 * the formula asks for more dice than the sequence has — makes each roll's
 * exact outcome predictable instead of only bounded. */
function fakeRng(values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length]!;
}

describe("rollFormula", () => {
  it("rolls a flat NdM formula off an injected rng, not Math.random", () => {
    // rng 0 -> floor(0*6)+1 = 1, rng just-under-1 -> floor(0.999999*6)+1 = 6
    expect(rollFormula("2d6", fakeRng([0, 0.999999]))).toBe(7);
  });

  it("adds a positive flat modifier", () => {
    expect(rollFormula("1d8+5", fakeRng([0.5]))).toBe(10); // floor(0.5*8)+1=5, +5
  });

  it("subtracts a negative flat modifier", () => {
    expect(rollFormula("3d4-2", fakeRng([0, 0, 0]))).toBe(1); // 1+1+1-2
  });

  it("tolerates spaces around the flat modifier", () => {
    expect(rollFormula("1d6 + 3", fakeRng([0]))).toBe(4);
  });

  it("defaults to Math.random when no rng is supplied", () => {
    // d1 is degenerate but deterministic regardless of rng: floor(x*1)+1 is
    // always 1 for any x in [0, 1), so this exercises the real default
    // parameter without making the assertion itself depend on chance.
    expect(rollFormula("1d1")).toBe(1);
  });

  it("rejects a formula outside NdM(+/-K) — no general expression evaluator here", () => {
    expect(rollFormula("2d6+1d4")).toBeNull();
    expect(rollFormula("banana")).toBeNull();
    expect(rollFormula("")).toBeNull();
    expect(rollFormula("d6")).toBeNull(); // count is required, not implicit 1
  });

  it("rejects a zero die count or size rather than looping zero or infinite times", () => {
    expect(rollFormula("0d6")).toBeNull();
    expect(rollFormula("1d0")).toBeNull();
  });

  it("rejects an absent formula", () => {
    expect(rollFormula(undefined)).toBeNull();
  });
});
