import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { normalizeTraits } from "../src/normalize/traits.js";

const stagLord = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("./fixtures/the-stag-lord.json", import.meta.url)),
    "utf8",
  ),
);

describe("normalizeTraits", () => {
  it("strips legacy alignment traits", () => {
    const result = normalizeTraits(stagLord.system.traits, "kingmaker-bestiary/the-stag-lord");
    expect(result.traits).toEqual(["human", "humanoid"]);
    expect(result.traits).not.toContain("chaotic");
    expect(result.traits).not.toContain("evil");
  });

  it("keeps rarity and expands size", () => {
    const result = normalizeTraits(stagLord.system.traits, "kingmaker-bestiary/the-stag-lord");
    expect(result.rarity).toBe("unique");
    expect(result.size).toBe("medium");
  });

  it("sorts traits for deterministic output", () => {
    const result = normalizeTraits(
      {
        rarity: "common",
        size: { value: "grg" },
        value: ["zombie", "aberration", "good"],
      },
      "some-pack/some-slug",
    );
    expect(result.traits).toEqual(["aberration", "zombie"]);
    expect(result.size).toBe("gargantuan");
  });

  it("names the offending value and the creature when the size abbreviation is unknown", () => {
    expect(() =>
      normalizeTraits(
        { rarity: "common", size: { value: "colossal" }, value: [] },
        "pathfinder-bestiary/frost-giant",
      ),
    ).toThrow(/colossal/);
    expect(() =>
      normalizeTraits(
        { rarity: "common", size: { value: "colossal" }, value: [] },
        "pathfinder-bestiary/frost-giant",
      ),
    ).toThrow(/pathfinder-bestiary\/frost-giant/);
  });
});
