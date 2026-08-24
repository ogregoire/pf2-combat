import { describe, expect, it } from "vitest";
import { resolveModifiers, type Modifier } from "../src/rules/modifiers.js";
import { compareStrings } from "../src/rules/compare.js";

const m = (value: number, type: Modifier["type"], source: string): Modifier => ({
  value,
  type,
  source,
});

describe("compareStrings", () => {
  it("orders by code unit, not locale", () => {
    expect(compareStrings("Z", "a")).toBeLessThan(0);
    expect(compareStrings("a", "b")).toBeLessThan(0);
    expect(compareStrings("a", "a")).toBe(0);
  });
});

describe("resolveModifiers", () => {
  it("applies only the worst status penalty", () => {
    const r = resolveModifiers([
      m(-1, "status", "sickened 1"),
      m(-2, "status", "frightened 2"),
    ]);
    expect(r.total).toBe(-2);
    expect(r.applied.map((x) => x.source)).toEqual(["frightened 2"]);
    expect(r.suppressed.map((x) => x.source)).toEqual(["sickened 1"]);
  });

  it("applies only the best bonus of a type", () => {
    const r = resolveModifiers([
      m(1, "status", "bless"),
      m(2, "status", "heroism"),
    ]);
    expect(r.total).toBe(2);
    expect(r.applied.map((x) => x.source)).toEqual(["heroism"]);
  });

  it("keeps a bonus and a penalty of the same type", () => {
    const r = resolveModifiers([
      m(2, "status", "heroism"),
      m(-1, "status", "sickened 1"),
    ]);
    expect(r.total).toBe(1);
    expect(r.applied).toHaveLength(2);
  });

  it("stacks across different types", () => {
    const r = resolveModifiers([
      m(-2, "status", "frightened 2"),
      m(-2, "circumstance", "off-guard"),
      m(1, "item", "weapon potency"),
    ]);
    expect(r.total).toBe(-3);
  });

  it("stacks every untyped modifier", () => {
    const r = resolveModifiers([
      m(-1, "untyped", "a"),
      m(-1, "untyped", "b"),
      m(-1, "untyped", "c"),
    ]);
    expect(r.total).toBe(-3);
    expect(r.suppressed).toEqual([]);
  });

  it("returns zero for no modifiers", () => {
    expect(resolveModifiers([]).total).toBe(0);
  });

  it("orders applied deterministically by type then source", () => {
    const r = resolveModifiers([
      m(-2, "status", "zeta"),
      m(-2, "circumstance", "alpha"),
    ]);
    expect(r.applied.map((x) => x.source)).toEqual(["alpha", "zeta"]);
  });
});
