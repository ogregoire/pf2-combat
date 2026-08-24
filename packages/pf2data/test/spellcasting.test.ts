import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { normalizeSpellcasting } from "../src/normalize/spellcasting.js";

const nyrissa = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("./fixtures/nyrissa.json", import.meta.url)),
    "utf8",
  ),
);

describe("normalizeSpellcasting", () => {
  it("finds all three of Nyrissa's entries", () => {
    const entries = normalizeSpellcasting(nyrissa.items);
    expect(entries.map((e) => e.name).sort()).toEqual([
      "Arcane Focus Spells",
      "Arcane Spontaneous Spells",
      "Primal Innate Spells",
    ]);
  });

  it("reads tradition, preparation and dc", () => {
    const entries = normalizeSpellcasting(nyrissa.items);
    const spont = entries.find((e) => e.name === "Arcane Spontaneous Spells")!;
    expect(spont.tradition).toBe("arcane");
    expect(spont.preparation).toBe("spontaneous");
    expect(spont.dc).toBe(46);
    expect(spont.attack).toBe(42);
  });

  it("attaches spells to the entry that owns them", () => {
    const entries = normalizeSpellcasting(nyrissa.items);
    const total = entries.reduce((sum, e) => sum + e.spells.length, 0);
    // 64 spell items, 7 of which are rituals with no spellcasting entry.
    expect(total).toBe(57);
    const spont = entries.find((e) => e.name === "Arcane Spontaneous Spells")!;
    expect(spont.spells.some((s) => s.name === "Wish")).toBe(true);
  });

  it("excludes rituals, which have no spellcasting entry", () => {
    const entries = normalizeSpellcasting(nyrissa.items);
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
    const entries = normalizeSpellcasting(nyrissa.items);
    const attached = entries.reduce((sum, e) => sum + e.spells.length, 0);
    const castable = nyrissa.items.filter(
      (i: any) => i.type === "spell" && (i.system.ritual ?? null) === null,
    ).length;
    expect(attached).toBe(castable);
  });

  it("reads slot maxima", () => {
    const entries = normalizeSpellcasting(nyrissa.items);
    const spont = entries.find((e) => e.name === "Arcane Spontaneous Spells")!;
    expect(spont.slots).toContainEqual({ rank: 10, max: 1 });
    expect(spont.slots).toContainEqual({ rank: 1, max: 4 });
  });
});
