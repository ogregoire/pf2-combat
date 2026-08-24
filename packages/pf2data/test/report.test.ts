import { describe, expect, it } from "vitest";
import { diffDataset, statusOf } from "../src/report.js";

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
