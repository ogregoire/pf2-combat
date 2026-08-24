import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { normalizeDefenses } from "../src/normalize/defenses.js";

const load = (name: string) =>
  JSON.parse(
    readFileSync(
      fileURLToPath(new URL(`./fixtures/${name}.json`, import.meta.url)),
      "utf8",
    ),
  );

describe("normalizeDefenses", () => {
  it("reads core defences from a creature with no weaknesses", () => {
    const d = normalizeDefenses(load("the-stag-lord").system);
    expect(d.ac).toBe(23);
    expect(d.hp).toBe(110);
    expect(d.saves).toEqual({ fortitude: 15, reflex: 16, will: 9 });
    expect(d.perception).toBe(16);
    expect(d.immunities).toEqual([]);
    expect(d.weaknesses).toEqual([]);
    expect(d.resistances).toEqual([]);
  });

  it("reads a weakness and senses", () => {
    const d = normalizeDefenses(load("troll").system);
    expect(d.weaknesses).toEqual([{ type: "fire", value: 10 }]);
    expect(d.senses).toEqual(["darkvision"]);
    expect(d.languages).toEqual(["jotun"]);
  });

  it("flattens skills, ability mods and speeds", () => {
    const d = normalizeDefenses(load("the-stag-lord").system);
    expect(d.skills.stealth).toBe(14);
    expect(d.abilityMods.dex).toBe(4);
    expect(d.speeds).toEqual([{ type: "land", value: 20 }]);
  });
});
