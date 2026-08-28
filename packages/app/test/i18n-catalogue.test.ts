import { describe, expect, it } from "vitest";
import { compareStrings } from "../src/rules/compare.js";
import { ALLOWLIST, STRINGS_EN, STRINGS_FR } from "../src/i18n/index.js";

describe("i18n catalogue", () => {
  it("fr covers every en key", () => {
    expect(Object.keys(STRINGS_FR).sort(compareStrings)).toEqual(Object.keys(STRINGS_EN).sort(compareStrings));
  });

  it("has no key whose French equals its English, unless it is a proper noun", () => {
    // Catches keys copied across and never translated. ALLOWLIST holds the
    // handful that legitimately match (loanwords the remaster's own French
    // keeps, or words spelled the same in both languages).
    const identical = (Object.keys(STRINGS_EN) as (keyof typeof STRINGS_EN)[]).filter(
      (k) => STRINGS_EN[k] === STRINGS_FR[k],
    );
    expect(identical.filter((k) => !ALLOWLIST.has(k))).toEqual([]);
  });
});
