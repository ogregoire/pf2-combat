import { describe, expect, it } from "vitest";
import { stableStringify } from "../src/io/write.js";

describe("stableStringify", () => {
  it("sorts object keys at every depth", () => {
    const out = stableStringify({ b: 1, a: { d: 2, c: 3 } });
    expect(out).toBe('{\n  "a": {\n    "c": 3,\n    "d": 2\n  },\n  "b": 1\n}\n');
  });

  it("preserves array order", () => {
    expect(stableStringify(["z", "a"])).toBe('[\n  "z",\n  "a"\n]\n');
  });

  it("is stable across differently ordered but equal inputs", () => {
    expect(stableStringify({ a: 1, b: 2 })).toBe(stableStringify({ b: 2, a: 1 }));
  });

  it("ends with exactly one newline", () => {
    const out = stableStringify({ a: 1 });
    expect(out.endsWith("}\n")).toBe(true);
    expect(out.endsWith("}\n\n")).toBe(false);
  });
});
