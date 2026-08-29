import { describe, expect, it } from "vitest";
import { totalInitiative } from "../src/rules/initiative.js";

// The one rule for every place a GM types an initiative (row popover, Quick
// add, the + Add drawer): a creature's typed number is a d20 result the GM
// just rolled, so it's totalled with the creature's own modifier; a PC's is
// already the party's reported final total, so it always commits as typed.
describe("totalInitiative", () => {
  it("sums a creature's typed die result with its modifier", () => {
    expect(totalInitiative("creature", 13, 5)).toBe(18);
  });

  it("commits a creature's typed value unchanged when it has no modifier on record, inventing no +0", () => {
    expect(totalInitiative("creature", 13, null)).toBe(13);
  });

  it("commits a PC's typed value unchanged even when a modifier is on record", () => {
    expect(totalInitiative("pc", 27, 7)).toBe(27);
  });

  it("commits a PC's typed value unchanged when no modifier is on record", () => {
    expect(totalInitiative("pc", 27, null)).toBe(27);
  });
});
