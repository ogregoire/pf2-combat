import { describe, expect, it } from "vitest";
import { pluralize } from "../src/rules/plural.js";

describe("pluralize", () => {
  // English unchanged — existing behaviour must not move.
  it("appends s in English", () => expect(pluralize("Goblin", 2, "en")).toBe("Goblins"));
  it("returns the singular for a quantity of 1", () => expect(pluralize("Gobelin", 1, "fr")).toBe("Gobelin"));

  // French rules, applied to the LAST word only — the head noun is not
  // reliably first in French ("Troll des glaces" pluralises the troll).
  it("appends s to a plain French noun", () => expect(pluralize("Gobelin", 2, "fr")).toBe("Gobelins"));
  it("leaves a name already ending in s, x or z unchanged", () => {
    expect(pluralize("Chauves-souris crépitante", 2, "fr")).toBe("Chauves-souris crépitantes");
    expect(pluralize("Kobold véreux", 2, "fr")).toBe("Kobold véreux");
    // "Rémorhaz" — a real creature name — pins the -z branch specifically:
    // the -s/-x test above doesn't exercise it, so a mutant that dropped
    // just the -z check passed undetected until this was added.
    expect(pluralize("Rémorhaz", 2, "fr")).toBe("Rémorhaz");
  });
  it("turns -al into -aux", () => expect(pluralize("Cheval", 2, "fr")).toBe("Chevaux"));
  it("adds x after -eau and -eu", () => {
    expect(pluralize("Corbeau", 2, "fr")).toBe("Corbeaux");
    // "Géant du feu" — a real creature name — pins the plain -eu branch:
    // the -eau test above doesn't exercise it on its own, so a mutant that
    // dropped just the -eu check passed undetected until this was added.
    expect(pluralize("Géant du feu", 2, "fr")).toBe("Géant du feux");
  });
  it("leaves a parenthesised qualifier alone", () => {
    expect(pluralize("Jann (Génie)", 2, "fr")).toBe("Janns (Génie)");
  });
});
