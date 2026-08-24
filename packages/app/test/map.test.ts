import { describe, expect, it } from "vitest";
import { mapLadder, mapPenalty } from "../src/rules/map.js";

describe("mapPenalty", () => {
  it("is zero for the first strike", () => {
    expect(mapPenalty(0, false)).toBe(0);
  });

  it("is -5 then -10 for a normal weapon", () => {
    expect(mapPenalty(1, false)).toBe(-5);
    expect(mapPenalty(2, false)).toBe(-10);
  });

  it("is -4 then -8 for an agile weapon", () => {
    expect(mapPenalty(1, true)).toBe(-4);
    expect(mapPenalty(2, true)).toBe(-8);
  });

  it("never worsens past the third strike", () => {
    expect(mapPenalty(3, false)).toBe(-10);
    expect(mapPenalty(9, false)).toBe(-10);
    expect(mapPenalty(9, true)).toBe(-8);
  });
});

describe("mapLadder", () => {
  it("gives the three bonuses for the Stag Lord's longsword", () => {
    expect(mapLadder(15, false)).toEqual([15, 10, 5]);
  });

  it("uses the agile steps", () => {
    expect(mapLadder(15, true)).toEqual([15, 11, 7]);
  });
});
