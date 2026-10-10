import { describe, expect, it } from "vitest";
import type { Spellcasting } from "@pf2/schema";
import { castLimit, castsLeft, focusPool, spellCost, spellRows } from "../src/rules/spells.js";

type Spell = Spellcasting["spells"][number];
const spell = (over: Partial<Spell> = {}): Spell => ({
  name: "Fireball", slug: "fireball", rank: 3, cost: "2", cantrip: false, frequency: null, uses: null, prepared: 0, ...over,
});
const entry = (over: Partial<Spellcasting> = {}): Spellcasting => ({
  name: "Arcane Spontaneous Spells", tradition: "arcane", preparation: "spontaneous", dc: 25, attack: 17,
  slots: [], focusPoints: null, spells: [], ...over,
});

describe("spellCost", () => {
  it("reads fixed, ranged, reaction, free and long casts", () => {
    expect(spellCost("2")).toEqual({ kind: "actions", min: 2, max: 2 });
    expect(spellCost("1 to 3")).toEqual({ kind: "actions", min: 1, max: 3 });
    expect(spellCost("1 or 2")).toEqual({ kind: "actions", min: 1, max: 2 });
    expect(spellCost("reaction")).toEqual({ kind: "reaction" });
    expect(spellCost("free")).toEqual({ kind: "free" });
    expect(spellCost("10 minutes")).toEqual({ kind: "long", text: "10 minutes" });
  });
});

describe("castLimit — PF2's casting limits", () => {
  it("lets cantrips and at-will spells be cast without limit, and never casts a constant one", () => {
    expect(castLimit(entry(), 0, spell({ cantrip: true }), 0, 0)).toEqual({ kind: "unlimited" });
    // At will wins over a stray per-day count (fiend caller's "Sending (At-Will)" has 99).
    expect(castLimit(entry({ preparation: "innate" }), 0, spell({ frequency: "at-will", uses: 99 }), 0, 0)).toEqual({ kind: "unlimited" });
    expect(castLimit(entry({ preparation: "innate" }), 0, spell({ frequency: "constant" }), 0, 0)).toEqual({ kind: "constant" });
  });

  it("gives an innate spell its stated daily uses, once a day when none is stated", () => {
    const innate = entry({ preparation: "innate" });
    expect(castLimit(innate, 0, spell({ uses: 3 }), 2, 0)).toMatchObject({ key: "0:2", max: 3, per: "day" });
    expect(castLimit(innate, 0, spell(), 2, 0)).toMatchObject({ max: 1, per: "day" });
  });

  it("shares a spontaneous rank's slots across every spell of that rank", () => {
    const spont = entry({ slots: [{ rank: 3, max: 2 }] });
    const a = castLimit(spont, 1, spell({ name: "Fireball" }), 0, 0);
    const b = castLimit(spont, 1, spell({ name: "Haste" }), 1, 0);
    expect(a).toEqual(b);
    expect(a).toMatchObject({ key: "1:rank3", max: 2, per: "slot" });
  });

  it("lets each prepared copy be cast once", () => {
    const prep = entry({ preparation: "prepared" });
    expect(castLimit(prep, 0, spell({ prepared: 2 }), 4, 0)).toMatchObject({ key: "0:4", max: 2, per: "prepared" });
  });

  it("draws every focus spell from one shared Focus Point pool", () => {
    const focus = entry({ preparation: "focus", focusPoints: 2 });
    expect(castLimit(focus, 0, spell(), 0, 2)).toMatchObject({ key: "focus", max: 2, per: "focus" });
    expect(castLimit(focus, 3, spell({ name: "Other" }), 1, 2)).toMatchObject({ key: "focus" });
  });

  it("counts what is left from the spent uses", () => {
    const limit = castLimit(entry({ slots: [{ rank: 3, max: 2 }] }), 0, spell(), 0, 0);
    expect(castsLeft(limit, {})).toBe(2);
    expect(castsLeft(limit, { "0:rank3": 2 })).toBe(0);
    expect(castsLeft({ kind: "unlimited" }, {})).toBeNull();
  });
});

describe("focusPool", () => {
  it("takes the stated pool, else one per focus spell up to 3", () => {
    expect(focusPool([entry({ preparation: "focus", focusPoints: 2 })])).toBe(2);
    const many = Array.from({ length: 5 }, (_, i) => spell({ name: `F${i}` }));
    expect(focusPool([entry({ preparation: "focus", spells: many })])).toBe(3);
    expect(focusPool([entry()])).toBe(0);
  });
});

describe("spellRows", () => {
  it("orders by rank, highest first, then the most actions, with cantrips after the ranked spells", () => {
    const rows = spellRows([
      entry({
        spells: [
          spell({ name: "Light", rank: 4, cantrip: true, cost: "2" }),
          spell({ name: "Haste", rank: 3, cost: "2" }),
          spell({ name: "Heal", rank: 3, cost: "1 to 3" }),
          spell({ name: "Fly", rank: 4, cost: "2" }),
          spell({ name: "Feather Fall", rank: 3, cost: "reaction" }),
          spell({ name: "Teleport", rank: 3, cost: "10 minutes" }),
        ],
      }),
    ]);
    expect(rows.map((r) => r.spell.name)).toEqual(["Fly", "Heal", "Haste", "Feather Fall", "Teleport", "Light"]);
  });

  it("keeps each spell's position in the flattened list, for the French overlay", () => {
    const rows = spellRows([
      entry({ spells: [spell({ name: "A", rank: 1 })] }),
      entry({ preparation: "innate", spells: [spell({ name: "B", rank: 5 })] }),
    ]);
    expect(rows.map((r) => [r.spell.name, r.flatIndex])).toEqual([["B", 1], ["A", 0]]);
  });
});
