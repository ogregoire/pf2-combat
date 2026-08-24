import { describe, expect, it } from "vitest";
import { creatureXp, encounterXp, partyLevelFor } from "../src/rules/xp.js";

describe("creatureXp", () => {
  it("uses the level-delta table", () => {
    expect(creatureXp(4, 4)).toBe(40);
    expect(creatureXp(6, 4)).toBe(80);
    expect(creatureXp(0, 4)).toBe(10);
    expect(creatureXp(3, 4)).toBe(30);
    expect(creatureXp(8, 4)).toBe(160);
  });

  it("clamps beyond the table", () => {
    expect(creatureXp(-2, 4)).toBe(0);
    expect(creatureXp(20, 4)).toBe(160);
  });
});

describe("encounterXp", () => {
  it("sums the Stag Lord encounter at party level 4", () => {
    // Stag Lord 6, Akiros 3, Dovan 2, three bandits at 0
    expect(encounterXp([6, 3, 2, 0, 0, 0], 4)).toBe(160);
  });
});

describe("partyLevelFor", () => {
  it("uses the highest when at most two are behind", () => {
    expect(partyLevelFor([5, 5, 4, 4]).level).toBe(5);
  });

  it("averages when everyone differs", () => {
    expect(partyLevelFor([3, 4, 5, 6]).level).toBe(5);
  });

  it("handles one character far ahead", () => {
    const r = partyLevelFor([3, 3, 3, 7]);
    expect(r.level).toBe(3);
    expect(r.extraPcs).toBe(2);
  });

  it("explains itself", () => {
    expect(partyLevelFor([5, 5, 4, 4]).derivation).toContain("highest");
  });
});
