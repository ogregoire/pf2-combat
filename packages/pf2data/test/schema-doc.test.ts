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

  it("documents the exit codes", () => {
    const doc = renderSchemaDoc();
    expect(doc).toContain("10");
    expect(doc.toLowerCase()).toContain("verification failed");
  });
});
