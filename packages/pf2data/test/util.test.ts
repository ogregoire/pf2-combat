import { describe, expect, it } from "vitest";
import { compareStrings } from "../src/util.js";

describe("compareStrings", () => {
  it("orders by UTF-16 code unit, not by locale collation", () => {
    // Under a locale-aware comparator (the ICU rules "a".localeCompare("Z")
    // follows in most locales, including en-US and da_DK) lowercase and
    // uppercase letters interleave alphabetically: "a" sorts before "Z".
    // Plain code-unit comparison never does this: every uppercase letter
    // (0x41-0x5A) sorts before every lowercase letter (0x61-0x7A), so "Z"
    // (0x5A) sorts before "a" (0x61) regardless of which machine runs it.
    expect(compareStrings("a", "Z")).toBeGreaterThan(0);
    expect(["a", "Z"].sort(compareStrings)).toEqual(["Z", "a"]);
  });

  it("is consistent regardless of the process locale", () => {
    // compareStrings must not consult Intl/ICU at all, so its result for a
    // fixed pair is identical no matter what LC_ALL the process runs under.
    expect(compareStrings("a", "Z")).toBe(compareStrings("a", "Z"));
    expect(compareStrings("apple", "apple")).toBe(0);
    expect(compareStrings("apple", "banana")).toBeLessThan(0);
    expect(compareStrings("banana", "apple")).toBeGreaterThan(0);
  });
});
