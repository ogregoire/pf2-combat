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
    expect(d.saves).toEqual({
      fortitude: { value: 15, detail: null },
      reflex: { value: 16, detail: null },
      will: { value: 9, detail: null },
    });
    expect(d.perception).toBe(16);
    expect(d.immunities).toEqual([]);
    expect(d.weaknesses).toEqual([]);
    expect(d.resistances).toEqual([]);
  });

  it("reads a weakness and senses", () => {
    const d = normalizeDefenses(load("troll").system);
    expect(d.weaknesses).toEqual([
      { type: "fire", value: 10, exceptions: [], doubleVs: [] },
    ]);
    expect(d.senses).toEqual([{ type: "darkvision", acuity: null, range: null }]);
    expect(d.languages).toEqual(["jotun"]);
  });

  it("normalizes hpDetails, empty acDetails and empty saveDetail to null, and keeps a real hpDetails", () => {
    const d = normalizeDefenses(load("troll").system);
    expect(d.hpDetails).toBe("regeneration 20 (deactivated by acid or fire)");
    expect(d.acDetails).toBeNull();
    expect(d.saves.fortitude.detail).toBeNull();
  });

  it("captures resistance exceptions and doubleVs", () => {
    const d = normalizeDefenses({
      ...baseSystem,
      attributes: {
        ...baseSystem.attributes,
        resistances: [
          {
            type: "all-damage",
            value: 10,
            exceptions: ["force", "ghost-touch"],
            doubleVs: ["non-magical"],
          },
        ],
      },
    });
    expect(d.resistances).toEqual([
      {
        type: "all-damage",
        value: 10,
        exceptions: ["force", "ghost-touch"],
        doubleVs: ["non-magical"],
      },
    ]);
  });

  it("captures acuity and range on a sense", () => {
    const d = normalizeDefenses({
      ...baseSystem,
      perception: {
        mod: 0,
        senses: [{ type: "scent", acuity: "imprecise", range: 30 }],
      },
    });
    expect(d.senses).toEqual([{ type: "scent", acuity: "imprecise", range: 30 }]);
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
