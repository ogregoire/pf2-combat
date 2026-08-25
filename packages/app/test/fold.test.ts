import { describe, expect, it } from "vitest";
import { fold, namePart } from "../src/rules/fold.js";

describe("fold", () => {
  it("strips diacritics", () => {
    expect(fold("Quatoïde (Élémentaire, eau)")).toBe("quatoide (elementaire, eau)");
    expect(fold("Seigneur Cerf")).toBe("seigneur cerf");
  });

  it("lowercases plain ASCII the same as before", () => {
    expect(fold("Goblin Warrior")).toBe("goblin warrior");
  });

  it("is idempotent — folding an already-folded string changes nothing", () => {
    const once = fold("Dévoreur d'intellect");
    expect(fold(once)).toBe(once);
  });
});

describe("namePart", () => {
  it("strips a parenthesised qualifier and trims", () => {
    expect(namePart("Quatoïde (Élémentaire, eau)")).toBe("Quatoïde");
    expect(namePart("Jann (Génie)")).toBe("Jann");
  });

  it("returns the name unchanged when there is no qualifier", () => {
    expect(namePart("Seigneur Cerf")).toBe("Seigneur Cerf");
  });
});
