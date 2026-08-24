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

  const baseSystem = {
    abilities: { str: { mod: 0 } },
    attributes: {
      ac: { value: 10 },
      hp: { max: 1 },
      speed: { value: 25, otherSpeeds: [] as { type: string; value: number }[] },
    },
    details: { languages: { value: [] } },
    perception: { mod: 0, senses: [] },
    saves: {
      fortitude: { value: 0 },
      reflex: { value: 0 },
      will: { value: 0 },
    },
    skills: {},
  };

  it("sorts other speeds with land kept first", () => {
    const d = normalizeDefenses({
      ...baseSystem,
      attributes: {
        ...baseSystem.attributes,
        speed: {
          value: 25,
          otherSpeeds: [
            { type: "swim", value: 15 },
            { type: "burrow", value: 10 },
            { type: "fly", value: 30 },
          ],
        },
      },
    });
    expect(d.speeds).toEqual([
      { type: "land", value: 25 },
      { type: "burrow", value: 10 },
      { type: "fly", value: 30 },
      { type: "swim", value: 15 },
    ]);
  });

  it("normalizes explicit null immunities, weaknesses and resistances to empty arrays", () => {
    const d = normalizeDefenses({
      ...baseSystem,
      attributes: {
        ...baseSystem.attributes,
        immunities: null,
        weaknesses: null,
        resistances: null,
      },
    });
    expect(d.immunities).toEqual([]);
    expect(d.weaknesses).toEqual([]);
    expect(d.resistances).toEqual([]);
  });

  it("omits the land entry when speed.value is null, keeping other speeds", () => {
    const d = normalizeDefenses({
      ...baseSystem,
      attributes: {
        ...baseSystem.attributes,
        speed: {
          value: null,
          otherSpeeds: [{ type: "fly", value: 60 }],
        },
      },
    });
    expect(d.speeds).toEqual([{ type: "fly", value: 60 }]);
  });

  it("drops a null-base skill while keeping well-formed siblings", () => {
    const d = normalizeDefenses({
      ...baseSystem,
      skills: {
        stealth: { base: 14 },
        "athletics+15": { base: null },
      },
    });
    expect(d.skills).toEqual({ stealth: 14 });
  });
});
