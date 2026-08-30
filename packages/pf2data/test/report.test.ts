import { describe, expect, it } from "vitest";
import { diffDataset, fieldCoverage, frenchCoverage, statusOf } from "../src/report.js";

const map = (entries: [string, string][]) => new Map(entries);

describe("diffDataset", () => {
  it("reports nothing for identical datasets", () => {
    const a = map([["p/a", "{}"]]);
    const diff = diffDataset(a, map([["p/a", "{}"]]));
    expect(diff).toEqual({ added: [], removed: [], modified: [] });
    expect(statusOf(diff)).toBe("unchanged");
  });

  it("detects additions, removals and modifications", () => {
    const diff = diffDataset(
      map([["p/gone", "{}"], ["p/same", "{}"], ["p/changed", "{\"a\":1}"]]),
      map([["p/same", "{}"], ["p/changed", "{\"a\":2}"], ["p/new", "{}"]]),
    );
    expect(diff).toEqual({
      added: ["p/new"],
      removed: ["p/gone"],
      modified: ["p/changed"],
    });
    expect(statusOf(diff)).toBe("updated");
  });

  it("sorts each list for deterministic reporting", () => {
    const diff = diffDataset(map([]), map([["p/z", "{}"], ["p/a", "{}"]]));
    expect(diff.added).toEqual(["p/a", "p/z"]);
  });
});

describe("frenchCoverage", () => {
  it("counts the translated creatures and NAMES the untranslated ones", () => {
    // The list matters as much as the count: 30 creatures have no French
    // entry today, and a silent drop from that number (upstream renames a
    // creature, Babele has not caught up) is exactly what this report exists
    // to catch. A bare count would only say "fewer", never "which".
    expect(
      frenchCoverage(
        ["p/a", "p/b", "p/c"],
        new Set(["p/b"]),
      ),
    ).toEqual({ translated: 1, total: 3, untranslated: ["p/a", "p/c"] });
  });

  it("sorts the untranslated list deterministically", () => {
    expect(
      frenchCoverage(["p/z", "p/a"], new Set()).untranslated,
    ).toEqual(["p/a", "p/z"]);
  });

  it("reports full coverage with an empty list", () => {
    expect(frenchCoverage(["p/a"], new Set(["p/a"]))).toEqual({
      translated: 1,
      total: 1,
      untranslated: [],
    });
  });
});

describe("fieldCoverage", () => {
  // Task 2: item-level counts (action names/descriptions) run into the
  // thousands, unlike the handful of untranslated creatures `frenchCoverage`
  // names individually -- so this reports counts only, no id list, and is
  // reused for BOTH the name and the description field.
  it("counts null vs non-null values", () => {
    expect(fieldCoverage(["<p>fr</p>", null, "<p>fr2</p>", null, null])).toEqual({
      translated: 2,
      total: 5,
    });
  });

  it("reports full coverage when nothing is null", () => {
    expect(fieldCoverage(["a", "b"])).toEqual({ translated: 2, total: 2 });
  });

  it("reports zero coverage for an empty list", () => {
    expect(fieldCoverage([])).toEqual({ translated: 0, total: 0 });
  });
});
