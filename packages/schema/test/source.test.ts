import { describe, expect, it } from "vitest";
import { parseSource } from "../src/index.js";

describe("parseSource", () => {
  it("reads a legacy OGL publication block", () => {
    const result = parseSource(
      { license: "OGL", remaster: false, title: "Pathfinder Kingmaker" },
      "kingmaker-bestiary",
    );
    expect(result).toEqual({
      pack: "kingmaker-bestiary",
      book: "Pathfinder Kingmaker",
      license: "OGL",
      remaster: false,
    });
  });

  it("falls back to the pack name when title is empty", () => {
    const result = parseSource(
      { license: "ORC", remaster: true, title: "" },
      "pathfinder-monster-core",
    );
    expect(result.book).toBe("pathfinder-monster-core");
    expect(result.remaster).toBe(true);
  });

  it("rejects an unknown license", () => {
    expect(() =>
      parseSource({ license: "WTFPL", remaster: false, title: "x" }, "p"),
    ).toThrow();
  });
});
