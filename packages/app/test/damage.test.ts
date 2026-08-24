import { describe, expect, it } from "vitest";
import { applyIwr, type Iwr } from "../src/rules/damage.js";

describe("applyIwr", () => {
  it("passes damage through unchanged when no type is chosen", () => {
    const iwr: Iwr = { immunities: ["fire"], weaknesses: [], resistances: [] };
    expect(applyIwr(10, "none", iwr)).toBe(10);
  });

  it("passes damage through unchanged when the combatant has no IWR", () => {
    expect(applyIwr(10, "fire", null)).toBe(10);
  });

  it("reduces immune damage to zero", () => {
    const iwr: Iwr = { immunities: ["fire"], weaknesses: [], resistances: [] };
    expect(applyIwr(10, "fire", iwr)).toBe(0);
  });

  it("adds the weakness value", () => {
    const iwr: Iwr = { immunities: [], weaknesses: [{ type: "cold", value: 5 }], resistances: [] };
    expect(applyIwr(10, "cold", iwr)).toBe(15);
  });

  it("subtracts the resistance value, never below zero", () => {
    const iwr: Iwr = { immunities: [], weaknesses: [], resistances: [{ type: "fire", value: 10 }] };
    expect(applyIwr(6, "fire", iwr)).toBe(0);
    expect(applyIwr(16, "fire", iwr)).toBe(6);
  });

  it("leaves an unrelated type untouched", () => {
    const iwr: Iwr = { immunities: [], weaknesses: [], resistances: [{ type: "fire", value: 10 }] };
    expect(applyIwr(10, "cold", iwr)).toBe(10);
  });

  it("skips an entry whose exceptions list names the chosen type", () => {
    // The dataset's exceptions (e.g. jaggedbriar-hag: physical 5 except
    // bludgeoning) name a *different* type than the entry itself, so they
    // never disqualify the entry under this button-per-entry UI — the GM
    // always picks the entry's own type. This exercises the guard directly.
    const iwr: Iwr = {
      immunities: [],
      weaknesses: [],
      resistances: [{ type: "physical", value: 5, exceptions: ["physical"] }],
    };
    expect(applyIwr(10, "physical", iwr)).toBe(10);
  });
});
