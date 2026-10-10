import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { normalizeSpellcasting } from "../src/normalize/spellcasting.js";

function load(name: string) {
  return JSON.parse(
    readFileSync(
      fileURLToPath(new URL(`./fixtures/${name}.json`, import.meta.url)),
      "utf8",
    ),
  );
}

const nyrissa = load("nyrissa");
// Level 23, focus pool 3 -- what normalizeCreature reads off her actor.
const NYRISSA = { level: 23, focusMax: 3 };

describe("normalizeSpellcasting", () => {
  it("finds all three of Nyrissa's entries", () => {
    const entries = normalizeSpellcasting(nyrissa.items, NYRISSA);
    expect(entries.map((e) => e.name).sort()).toEqual([
      "Arcane Focus Spells",
      "Arcane Spontaneous Spells",
      "Primal Innate Spells",
    ]);
  });

  it("reads tradition, preparation and dc", () => {
    const entries = normalizeSpellcasting(nyrissa.items, NYRISSA);
    const spont = entries.find((e) => e.name === "Arcane Spontaneous Spells")!;
    expect(spont.tradition).toBe("arcane");
    expect(spont.preparation).toBe("spontaneous");
    expect(spont.dc).toBe(46);
    expect(spont.attack).toBe(42);
  });

  it("attaches spells to the entry that owns them", () => {
    const entries = normalizeSpellcasting(nyrissa.items, NYRISSA);
    const total = entries.reduce((sum, e) => sum + e.spells.length, 0);
    // 64 spell items, 7 of which are rituals with no spellcasting entry.
    expect(total).toBe(57);
    const spont = entries.find((e) => e.name === "Arcane Spontaneous Spells")!;
    expect(spont.spells.some((s) => s.name === "Wish")).toBe(true);
  });

  it("excludes rituals, which have no spellcasting entry", () => {
    const entries = normalizeSpellcasting(nyrissa.items, NYRISSA);
    const all = entries.flatMap((e) => e.spells.map((s) => s.name));
    for (const ritual of [
      "Control Weather",
      "Create Demiplane",
      "Awaken Animal",
      "Commune with Nature",
      "Primal Call",
      "Geas",
      "Inveigle",
    ]) {
      expect(all).not.toContain(ritual);
    }
  });

  it("leaves no non-ritual spell orphaned", () => {
    const entries = normalizeSpellcasting(nyrissa.items, NYRISSA);
    const attached = entries.reduce((sum, e) => sum + e.spells.length, 0);
    const castable = nyrissa.items.filter(
      (i: any) => i.type === "spell" && (i.system.ritual ?? null) === null,
    ).length;
    expect(attached).toBe(castable);
  });

  it("reads slot maxima", () => {
    const entries = normalizeSpellcasting(nyrissa.items, NYRISSA);
    const spont = entries.find((e) => e.name === "Arcane Spontaneous Spells")!;
    expect(spont.slots).toContainEqual({ rank: 10, max: 1 });
    expect(spont.slots).toContainEqual({ rank: 1, max: 4 });
  });
});

/** A minimal upstream `spellcastingEntry` item, in the shape the five books
 * actually use. */
function entry(
  id: string,
  preparation: string,
  slots: Record<string, unknown> = {},
  autoHeightenLevel: number | null = null,
) {
  return {
    _id: id,
    name: `${preparation} entry`,
    type: "spellcastingEntry",
    system: {
      prepared: { value: preparation },
      slots,
      spelldc: { dc: 20, value: 12 },
      tradition: { value: "arcane" },
      autoHeightenLevel: { value: autoHeightenLevel },
    },
  };
}

/** A minimal upstream `spell` item owned by entry `owner`. */
function spell(
  id: string,
  name: string,
  owner: string | null,
  opts: {
    level?: number;
    traits?: string[];
    time?: string;
    heightenedLevel?: number;
    uses?: { max?: number; value: number };
    ritual?: unknown;
  } = {},
) {
  return {
    _id: id,
    name,
    type: "spell",
    system: {
      level: { value: opts.level ?? 1 },
      location: {
        value: owner,
        ...(opts.heightenedLevel === undefined ? {} : { heightenedLevel: opts.heightenedLevel }),
        ...(opts.uses === undefined ? {} : { uses: opts.uses }),
      },
      ritual: opts.ritual ?? null,
      time: { value: opts.time ?? "2" },
      traits: { value: opts.traits ?? ["concentrate", "manipulate"] },
    },
  };
}

const LEVEL_5 = { level: 5, focusMax: null };

describe("normalizeSpellcasting: prepared entries", () => {
  // Regression: prepared slots are `{ max, prepared: [{ id }] }` with no
  // `value`, and the old schema required one -- every prepared entry (140
  // across the five books) failed to parse and vanished without a trace.
  const dragon = load("adamantine-dragon-adult-spellcaster");
  const [primal] = normalizeSpellcasting(dragon.items, { level: 13, focusMax: null });

  it("keeps the adamantine dragon spellcaster's prepared entry", () => {
    expect(primal!.name).toBe("Primal Prepared Spells");
    expect(primal!.preparation).toBe("prepared");
    expect(primal!.slots).toContainEqual({ rank: 0, max: 5 });
    expect(primal!.slots).toContainEqual({ rank: 6, max: 2 });
  });

  it("lists one row per slotted spell, with prepared counts", () => {
    // 5 cantrips + 3+3+3+3+3 ranked + 2 rank-6 slots, every one filled.
    expect(primal!.spells).toHaveLength(22);
    expect(primal!.spells.every((s) => s.prepared === 1)).toBe(true);
    expect(primal!.spells.find((s) => s.name === "Petrify")).toMatchObject({
      rank: 6,
      cantrip: false,
      cost: "2",
    });
  });

  it("ranks prepared cantrips by the entry's autoHeightenLevel, not ceil(level / 2)", () => {
    // Level 13 would give 7; upstream pins the entry at 6.
    const cantrips = primal!.spells.filter((s) => s.cantrip);
    expect(cantrips.map((s) => s.name)).toEqual([
      "Caustic Blast",
      "Detect Magic",
      "Know the Way",
      "Sigil",
      "Tangle Vine",
    ]);
    expect(cantrips.every((s) => s.rank === 6)).toBe(true);
  });

  it("counts repeats, splits ranks, and skips empty or unknown references", () => {
    const items = [
      entry("e", "prepared", {
        slot0: { max: 2, prepared: [{ id: "c" }, { id: null }] },
        // `expended` is upstream play state: still prepared, still counted.
        slot1: { max: 3, prepared: [{ id: "f" }, { id: "f", expended: true }, { id: "gone" }] },
        slot3: { max: 1, prepared: [{ id: "f" }] },
        // Greater herexen: a slot with no `max` and only empty references.
        slot4: { prepared: [{ id: null }, {}] },
      }),
      spell("c", "Daze", "e", { traits: ["cantrip"] }),
      spell("f", "Fear", "e", { level: 1 }),
      spell("u", "Unslotted", "e", { level: 2 }),
    ];
    const [out] = normalizeSpellcasting(items, LEVEL_5);
    expect(out!.slots).toEqual([
      { rank: 0, max: 2 },
      { rank: 1, max: 3 },
      { rank: 3, max: 1 },
    ]);
    expect(out!.spells.map((s) => [s.name, s.rank, s.prepared])).toEqual([
      ["Daze", 3, 1], // cantrip: ceil(5 / 2)
      ["Fear", 3, 1],
      ["Fear", 1, 2],
    ]);
  });

  it("puts prepared at 0 on every other preparation", () => {
    const all = normalizeSpellcasting(nyrissa.items, NYRISSA).flatMap((e) => e.spells);
    expect(all.every((s) => s.prepared === 0)).toBe(true);
  });
});

describe("normalizeSpellcasting: spell fields", () => {
  const items = [
    entry("i", "innate"),
    spell("a", "Dimension Door (At Will)", "i", { level: 4, heightenedLevel: 5 }),
    spell("b", "Tongues (Constant)", "i", { level: 5 }),
    spell("c", "Detect Magic", "i", { traits: ["cantrip", "detection"] }),
    spell("d", "Charm", "i", { level: 1, heightenedLevel: 4, uses: { max: 3, value: 2 } }),
    spell("e", "Heal", "i", { time: "1 to 3", level: 1 }),
    spell("f", "Sending (At-Will)", "i", { level: 5 }),
    spell("g", "Fly (At will) (Self only)", "i", { level: 4 }),
    spell("h", "Teleport", "i", { level: 6, time: "10 minutes" }),
    spell("j", "Dimensional Anchor (Self plus Willing Rider)", "i", { level: 4 }),
    // Crystal dragon (adult): uses with no `max` -- not a per-day count.
    spell("k", "Glitterdust", "i", { level: 2, uses: { value: 1 } }),
  ];
  const [out] = normalizeSpellcasting(items, LEVEL_5);
  const by = (name: string) => out!.spells.find((s) => s.name === name)!;

  it("keeps the upstream name and raw cast time", () => {
    expect(by("Heal").cost).toBe("1 to 3");
    expect(by("Teleport").cost).toBe("10 minutes");
  });

  it("ranks a non-cantrip by heightenedLevel, else its base level", () => {
    expect(by("Dimension Door (At Will)").rank).toBe(5);
    expect(by("Tongues (Constant)").rank).toBe(5);
    expect(by("Charm").rank).toBe(4);
  });

  it("ranks an unprepared cantrip at ceil(level / 2) when the entry sets no autoHeightenLevel", () => {
    expect(by("Detect Magic")).toMatchObject({ cantrip: true, rank: 3 });
    const [low] = normalizeSpellcasting(items, { level: -1, focusMax: null });
    expect(low!.spells.find((s) => s.name === "Detect Magic")!.rank).toBe(1);
  });

  it("reads frequency from the name's parenthetical", () => {
    expect(by("Dimension Door (At Will)").frequency).toBe("at-will");
    expect(by("Fly (At will) (Self only)").frequency).toBe("at-will");
    expect(by("Sending (At-Will)").frequency).toBe("at-will");
    expect(by("Tongues (Constant)").frequency).toBe("constant");
    expect(by("Teleport").frequency).toBeNull();
    expect(by("Dimensional Anchor (Self plus Willing Rider)").frequency).toBeNull();
  });

  it("reads per-day uses from uses.max only", () => {
    expect(by("Charm").uses).toBe(3);
    expect(by("Heal").uses).toBeNull();
    expect(by("Glitterdust").uses).toBeNull();
  });

  it("sorts by rank descending, then name", () => {
    expect(out!.spells.map((s) => s.rank)).toEqual(
      [...out!.spells.map((s) => s.rank)].sort((a, b) => b - a),
    );
  });
});

describe("normalizeSpellcasting: focus spells", () => {
  // Same PF2 rule as cantrips: a focus spell is heightened to half the
  // creature's level rounded up, not left at its base rank.
  it("auto-heightens a focus spell like a cantrip", () => {
    const entries = normalizeSpellcasting(nyrissa.items, NYRISSA);
    const focus = entries.find((e) => e.preparation === "focus")!;
    expect(focus.spells.every((s) => s.rank === 12)).toBe(true);
  });
});

describe("normalizeSpellcasting: entries", () => {
  it("sets focusPoints on focus entries only", () => {
    const entries = normalizeSpellcasting(nyrissa.items, NYRISSA);
    expect(entries.find((e) => e.preparation === "focus")!.focusPoints).toBe(3);
    expect(
      entries.filter((e) => e.preparation !== "focus").map((e) => e.focusPoints),
    ).toEqual([null, null]);
  });

  it("leaves focusPoints null when the actor states no focus pool", () => {
    // NPC Core's avuncular professor and gourd leshy witch.
    const [focus] = normalizeSpellcasting([entry("f", "focus")], LEVEL_5);
    expect(focus!.focusPoints).toBeNull();
  });

  it("coerces a string slot max instead of dropping the entry", () => {
    // Bone prophet, lunar naga, suli dune dancer, worm that walks cultist.
    const [out] = normalizeSpellcasting(
      [entry("s", "spontaneous", { slot1: { max: "4", value: "4" } })],
      LEVEL_5,
    );
    expect(out!.slots).toEqual([{ rank: 1, max: 4 }]);
  });

  it("throws on a spellcastingEntry it cannot read, rather than dropping it", () => {
    const broken = entry("x", "innate");
    delete (broken.system as Partial<typeof broken.system>).spelldc;
    expect(() => normalizeSpellcasting([broken], LEVEL_5)).toThrow(/spellcastingEntry/);
  });

  it("throws on a spell item it cannot read, rather than dropping it", () => {
    const broken = spell("x", "Fear", "i");
    delete (broken.system as Partial<typeof broken.system>).time;
    expect(() => normalizeSpellcasting([entry("i", "innate"), broken], LEVEL_5)).toThrow(
      /spell item "Fear"/,
    );
  });

  it("still skips rituals and spells with no owning entry", () => {
    const [out] = normalizeSpellcasting(
      [
        entry("i", "innate"),
        spell("r", "Geas", null, { ritual: { primary: {} }, time: "1 day" }),
        spell("o", "Orphan", "nowhere"),
        spell("k", "Kept", "i"),
      ],
      LEVEL_5,
    );
    expect(out!.spells.map((s) => s.name)).toEqual(["Kept"]);
  });
});
