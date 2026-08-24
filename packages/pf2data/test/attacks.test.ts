import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { normalizeAttacks } from "../src/normalize/attacks.js";

const stagLord = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("./fixtures/the-stag-lord.json", import.meta.url)),
    "utf8",
  ),
);

describe("normalizeAttacks", () => {
  it("reads bonus, damage and traits from a melee attack", () => {
    const attacks = normalizeAttacks(stagLord.items);
    const longsword = attacks.find((a) => a.name === "Longsword")!;
    expect(longsword.kind).toBe("melee");
    expect(longsword.bonus).toBe(15);
    expect(longsword.damage).toEqual([
      { formula: "1d8+5", type: "slashing" },
    ]);
    expect(longsword.traits).toEqual(["versatile-p"]);
  });

  it("classifies a ranged attack by weaponType", () => {
    const attacks = normalizeAttacks(stagLord.items);
    const bow = attacks.find((a) => a.name === "Composite Longbow")!;
    expect(bow.kind).toBe("ranged");
  });

  it("ignores items that are not attacks", () => {
    const attacks = normalizeAttacks(stagLord.items);
    expect(attacks.map((a) => a.name)).not.toContain("Hide Armor");
  });
});
