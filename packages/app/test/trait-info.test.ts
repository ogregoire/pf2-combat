import { describe, expect, it } from "vitest";
import { splitTraitValue, stripHtml } from "../src/rules/traitInfo.js";

describe("splitTraitValue", () => {
  it("splits a dice-valued trait", () => {
    expect(splitTraitValue("deadly-d10")).toEqual({ base: "deadly", value: "d10" });
  });

  it("splits a numeric-valued trait", () => {
    expect(splitTraitValue("range-120")).toEqual({ base: "range", value: "120" });
    expect(splitTraitValue("thrown-20")).toEqual({ base: "thrown", value: "20" });
    expect(splitTraitValue("reach-10")).toEqual({ base: "reach", value: "10" });
  });

  it("leaves a plain trait whole", () => {
    expect(splitTraitValue("agile")).toEqual({ base: "agile", value: null });
  });

  it("leaves a hyphenated non-valued trait whole", () => {
    expect(splitTraitValue("off-guard")).toEqual({ base: "off-guard", value: null });
    expect(splitTraitValue("attack-of-opportunity")).toEqual({ base: "attack-of-opportunity", value: null });
  });
});

describe("stripHtml", () => {
  it("strips tags and collapses whitespace", () => {
    expect(stripHtml("<p>You can't see.</p>\n<p>All terrain is difficult.</p>")).toBe(
      "You can't see. All terrain is difficult.",
    );
  });

  it("handles nested tags", () => {
    expect(stripHtml("<p><strong>Trigger</strong> Something happens</p>")).toBe("Trigger Something happens");
  });
});
