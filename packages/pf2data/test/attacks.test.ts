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
      { formula: "1d8+5", type: "slashing", category: null },
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

  it("infers a ranged attack from a range-* trait when weaponType is absent", () => {
    // Frost Giant's "Icicle": weaponType is absent upstream, but the
    // range-120 trait marks it as a ranged attack.
    const attacks = normalizeAttacks([
      {
        name: "Icicle",
        type: "melee",
        system: {
          bonus: { value: 10 },
          damageRolls: {},
          traits: { value: ["range-120"] },
        },
      },
    ]);
    expect(attacks[0]!.kind).toBe("ranged");
  });

  it("infers a ranged attack from a thrown-* trait when weaponType is absent (real fisher shape)", () => {
    // pathfinder-npc-core/fisher.json: upstream emits the thrown Spear as two
    // "melee"-type items sharing the same linkedWeapon, weaponType absent on
    // both. The +7 entry has no traits (the melee Strike) and must stay
    // melee; the +6 entry carries only thrown-20 (the ranged Strike) and
    // must now come out ranged instead of the old melee default.
    const attacks = normalizeAttacks([
      {
        name: "Spear",
        type: "melee",
        system: {
          attackEffects: { value: [] },
          bonus: { value: 7 },
          damageRolls: { a: { damage: "1d6+3", damageType: "piercing" } },
          traits: { value: [] },
        },
      },
      {
        name: "Spear",
        type: "melee",
        system: {
          attackEffects: { value: [] },
          bonus: { value: 6 },
          damageRolls: { a: { damage: "1d6+3", damageType: "piercing" } },
          traits: { value: ["thrown-20"] },
        },
      },
    ]);
    const melee = attacks.find((a) => a.bonus === 7)!;
    const ranged = attacks.find((a) => a.bonus === 6)!;
    expect(melee.kind).toBe("melee");
    expect(ranged.kind).toBe("ranged");
  });

  it("respects an explicit melee weaponType even when a thrown-* trait is present", () => {
    // pathfinder-monster-core/azarketi-crab-catcher.json's Dagger: upstream
    // explicitly tags weaponType "melee" despite the thrown-10 trait. That
    // explicit tag must win over trait-based inference.
    const attacks = normalizeAttacks([
      {
        name: "Dagger",
        type: "melee",
        system: {
          bonus: { value: 10 },
          damageRolls: {},
          traits: { value: ["agile", "finesse", "thrown-10", "versatile-s"] },
          weaponType: { value: "melee" },
        },
      },
    ]);
    expect(attacks[0]!.kind).toBe("melee");
  });

  it("still defaults to melee when neither weaponType nor a range-* trait is present", () => {
    const attacks = normalizeAttacks([
      {
        name: "Jaws",
        type: "melee",
        system: { bonus: { value: 10 }, damageRolls: {}, traits: { value: ["reach-10"] } },
      },
    ]);
    expect(attacks[0]!.kind).toBe("melee");
  });

  it("captures the attack-effects list, sorted", () => {
    const attacks = normalizeAttacks([
      {
        name: "Jaws",
        type: "melee",
        system: {
          bonus: { value: 10 },
          damageRolls: {},
          attackEffects: { value: ["poison", "grab"] },
        },
      },
    ]);
    expect(attacks[0]!.effects).toEqual(["grab", "poison"]);
  });

  it("defaults effects to an empty array when attackEffects is absent", () => {
    const attacks = normalizeAttacks([
      { name: "Fist", type: "melee", system: { bonus: { value: 5 }, damageRolls: {} } },
    ]);
    expect(attacks[0]!.effects).toEqual([]);
  });

  it("captures a persistent damage category", () => {
    const attacks = normalizeAttacks([
      {
        name: "Fangs",
        type: "melee",
        system: {
          bonus: { value: 10 },
          damageRolls: {
            a: { damage: "1d4", damageType: "piercing" },
            b: { damage: "1d6", damageType: "poison", category: "persistent" },
          },
        },
      },
    ]);
    const damage = attacks[0]!.damage;
    expect(damage.find((d) => d.type === "poison")!.category).toBe("persistent");
    expect(damage.find((d) => d.type === "piercing")!.category).toBeNull();
  });
});
