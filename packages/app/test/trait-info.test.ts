import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { GlossaryEntry } from "@pf2/schema";
import { actionDisplayName, slugifyAbilityName, splitTraitValue, stripHtml, type TraitInfo } from "../src/rules/traitInfo.js";

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

describe("slugifyAbilityName", () => {
  it("lowercases and hyphenates a plain multi-word name", () => {
    expect(slugifyAbilityName("Rend")).toBe("rend");
    expect(slugifyAbilityName("Attack of Opportunity")).toBe("attack-of-opportunity");
  });

  it("drops apostrophes outright instead of turning them into a hyphen", () => {
    // Matches how glossary.json itself is slugged: "(Ghost) Pyre's Memory"
    // -> "ghost-pyres-memory", not "ghost-pyre-s-memory".
    expect(slugifyAbilityName("(Ghost) Pyre's Memory")).toBe("ghost-pyres-memory");
    expect(slugifyAbilityName("Master's Eye")).toBe("masters-eye");
  });

  it("strips a leading symbol down to its adjacent digits, per the real '+1 Status...' glossary entry", () => {
    expect(slugifyAbilityName("+1 Status to All Saves vs. Magic")).toBe("1-status-to-all-saves-vs-magic");
  });

  it("does not strip parenthetical or numeric detail — the whole name is slugified as one unit", () => {
    // Deliberate: stripping "(Deactivated by Acid or Fire)" to fall back to
    // a bare "regeneration" glossary entry would risk attaching the wrong
    // creature's generic text to this one. See the function's own comment.
    expect(slugifyAbilityName("Regeneration 20 (Deactivated by Acid or Fire)")).toBe(
      "regeneration-20-deactivated-by-acid-or-fire",
    );
  });

  // Every real glossary.json entry's own slug must round-trip through this
  // function exactly — a guardrail against a future glossary name that this
  // slugifier can no longer reproduce (e.g. a new punctuation shape), which
  // would silently break the fallback for every action sharing that ability.
  it("reproduces every slug in the real data/glossary.json exactly", () => {
    const path = resolve(process.cwd(), "data/glossary.json");
    const entries = JSON.parse(readFileSync(path, "utf8")) as GlossaryEntry[];
    expect(entries.length).toBeGreaterThan(0);
    for (const entry of entries) {
      expect(slugifyAbilityName(entry.name)).toBe(entry.slug);
    }
  });
});

describe("actionDisplayName", () => {
  const glossary = new Map<string, TraitInfo>([
    ["rend", { name: "Éventration", description: "" }],
    ["attack-of-opportunity", { name: "Frappe réactive", description: "" }],
  ]);

  it("always returns the English name when lang is \"en\", regardless of frName/glossary", () => {
    expect(actionDisplayName("Éventration", "Rend", glossary, "en")).toBe("Rend");
    expect(actionDisplayName(null, "Rend", glossary, "en")).toBe("Rend");
  });

  it("prefers the creature record's own French name over the glossary", () => {
    // A glossary entry for "attack-of-opportunity" exists above, but the
    // creature record's own translation must win when present.
    expect(actionDisplayName("Frappe d'opportunité (maison)", "Attack of Opportunity", glossary, "fr")).toBe(
      "Frappe d'opportunité (maison)",
    );
  });

  it("falls back to the glossary's French name when the creature record's own name is null", () => {
    expect(actionDisplayName(null, "Rend", glossary, "fr")).toBe("Éventration");
  });

  it("falls back to the English name when neither the creature record nor the glossary has a translation", () => {
    expect(actionDisplayName(null, "Breath Weapon", glossary, "fr")).toBe("Breath Weapon");
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
