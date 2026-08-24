import { describe, expect, it } from "vitest";
import { applyIwr, relevantDamageTypes, type Iwr } from "../src/rules/damage.js";

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

  it("applies a same-type weakness and resistance together, not one cancelling the whole other out", () => {
    // Bog Mummy Cultist: weakness cold 10, resistance cold 5 — both real.
    const iwr: Iwr = {
      immunities: [],
      weaknesses: [{ type: "cold", value: 10 }],
      resistances: [{ type: "cold", value: 5 }],
    };
    // 20 cold -> +10 weakness -> 30 -> -5 resistance -> 25.
    expect(applyIwr(20, "cold", iwr)).toBe(25);
  });

  it("applies only the first entry when one category repeats a type", () => {
    const iwr: Iwr = {
      immunities: [],
      weaknesses: [],
      resistances: [
        { type: "cold", value: 10 },
        { type: "cold", value: 5 },
      ],
    };
    expect(applyIwr(20, "cold", iwr)).toBe(10);
  });
});

describe("relevantDamageTypes", () => {
  it("merges a same-type weakness and resistance into one row instead of two colliding rows", () => {
    const iwr: Iwr = {
      immunities: [],
      weaknesses: [{ type: "cold", value: 10 }],
      resistances: [{ type: "cold", value: 5 }],
    };
    const relevant = relevantDamageTypes(iwr);
    expect(relevant).toEqual([{ type: "cold", label: "+10 / −5" }]);
  });

  it("shows only IMM when a type is both immune and (nonsensically) weak or resistant", () => {
    const iwr: Iwr = {
      immunities: ["fire"],
      weaknesses: [{ type: "fire", value: 5 }],
      resistances: [],
    };
    expect(relevantDamageTypes(iwr)).toEqual([{ type: "fire", label: "IMM" }]);
  });

  it("keeps the plain numeric label when only one of weakness/resistance is present", () => {
    const iwr: Iwr = { immunities: [], weaknesses: [{ type: "cold", value: 5 }], resistances: [] };
    expect(relevantDamageTypes(iwr)).toEqual([{ type: "cold", label: "5" }]);
  });
});
