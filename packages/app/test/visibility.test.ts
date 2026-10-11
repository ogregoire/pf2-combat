import { describe, expect, it } from "vitest";
import { targetingFlatCheck } from "../src/rules/conditions.js";
import { resolveStrike } from "../src/rules/strike.js";

const strike = (attacker: { slug: never; value: number }[] | object[], target: object[]) =>
  resolveStrike({
    bonus: 10, kind: "melee", agile: false, strikesMade: 0,
    attackerConditions: attacker as never, targetConditions: target as never, targetAc: 20,
    damage: [{ formula: "1d8", type: "slashing" }],
  });

describe("seeing and being seen", () => {
  it("asks for the flat check the target's or the attacker's senses call for, the higher one", () => {
    expect(targetingFlatCheck([], [{ slug: "concealed", value: 0 }])).toEqual({ dc: 5, reason: "concealed" });
    expect(targetingFlatCheck([{ slug: "dazzled", value: 0 }], [{ slug: "hidden", value: 0 }])).toEqual({ dc: 11, reason: "hidden" });
    expect(targetingFlatCheck([], [{ slug: "invisible", value: 0 }])).toEqual({ dc: 11, reason: "undetected" });
    expect(targetingFlatCheck([{ slug: "blinded", value: 0 }], [])).toEqual({ dc: 11, reason: "blinded" });
    expect(targetingFlatCheck([], [])).toBeNull();
  });

  it("an unseen attacker catches its target off-guard, once", () => {
    expect(strike([{ slug: "invisible", value: 0 }], []).effectiveAc).toBe(18);
    expect(strike([{ slug: "hidden", value: 0 }], [{ slug: "off-guard", value: 0 }]).effectiveAc).toBe(18);
    expect(strike([], [{ slug: "hidden", value: 0 }]).flatCheck).toEqual({ dc: 11, reason: "hidden" });
  });
});
