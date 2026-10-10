import { describe, expect, it } from "vitest";
import { renderSchemaDoc } from "../src/docs/schema-doc.js";

describe("renderSchemaDoc", () => {
  it("documents every emitted file", () => {
    const doc = renderSchemaDoc();
    for (const path of [
      "manifest.json",
      "books.json",
      "index/<pack>.json",
      "creatures/<pack>/<slug>.json",
      "conditions.json",
      "glossary.json",
      "traits.json",
      "actions.json",
      "i18n/fr/actions.json",
      "spells/<slug>.json",
      "i18n/fr/spells/<slug>.json",
    ]) {
      expect(doc).toContain(path);
    }
  });

  it("documents the creature fields an agent needs", () => {
    const doc = renderSchemaDoc();
    for (const field of ["ac", "hp", "saves", "actions", "spellcasting", "remaster"]) {
      expect(doc).toContain(field);
    }
  });

  it("documents the spellcasting fields and the spells overlay", () => {
    const doc = renderSchemaDoc();
    for (const field of ["focusPoints", "frequency", "uses", "prepared", "cantrip", "spells-srd"]) {
      expect(doc).toContain(field);
    }
  });

  it("documents the spell row slug and every spell detail field", () => {
    const doc = renderSchemaDoc();
    const section = doc.slice(doc.indexOf("## Spell details"), doc.indexOf("## French overlay"));
    for (const field of [
      "slug",
      "rank",
      "cantrip",
      "traits",
      "traditions",
      "cost",
      "range",
      "area",
      "targets",
      "defense",
      "duration",
      "sustained",
      "description",
    ]) {
      expect(section).toContain(`\`${field}\``);
    }
    expect(doc).toContain("system.slug");
    expect(doc).toContain("pf2e.spells-srd.json");
  });

  it("documents the exit codes", () => {
    const doc = renderSchemaDoc();
    expect(doc).toContain("10");
    expect(doc.toLowerCase()).toContain("verification failed");
  });
});
