import { describe, expect, it } from "vitest";
import type { CreatureI18n } from "@pf2/schema";
import {
  loadConditionsI18n,
  loadCreatureI18n,
  loadGlossaryI18n,
  loadIndexI18n,
  loadTraitsI18n,
  pick,
} from "../src/data/i18nOverlay.js";

const fakeFetch = (body: unknown) =>
  async (): Promise<Response> => new Response(JSON.stringify(body), { status: 200 });

const notFoundFetch = async (): Promise<Response> => new Response(null, { status: 404 });

describe("pick", () => {
  it("prefers French and falls back to English", () => {
    expect(pick("Seigneur Cerf", "The Stag Lord")).toBe("Seigneur Cerf");
    expect(pick(null, "Manticore")).toBe("Manticore");
    expect(pick(undefined, "Manticore")).toBe("Manticore");
  });

  it("treats an empty French string as present, not missing", () => {
    // A translator may legitimately blank a field; only null/undefined mean absent.
    expect(pick("", "Something")).toBe("");
  });
});

describe("loadCreatureI18n", () => {
  it("resolves a 404 overlay to null rather than throwing", async () => {
    // An untranslated creature has NO overlay file. That is normal, not an error.
    await expect(loadCreatureI18n("x/manticore", notFoundFetch)).resolves.toBeNull();
  });

  it("reads a creature overlay", async () => {
    const overlay: CreatureI18n = {
      name: "Seigneur Cerf",
      publicNotes: null,
      actions: [{ en: "Hunt Prey", name: "Chasser une proie", description: null }],
      attacks: [{ en: "Composite Longbow", name: "Arc long composite" }],
    };
    const creature = await loadCreatureI18n("kingmaker-bestiary/the-stag-lord", fakeFetch(overlay));
    expect(creature).toEqual(overlay);
  });
});

describe("loadIndexI18n", () => {
  it("reads a pack's French name index", async () => {
    const idx = await loadIndexI18n(
      "kingmaker-bestiary",
      fakeFetch({ "kingmaker-bestiary/the-stag-lord": "Seigneur Cerf" }),
    );
    expect(idx["kingmaker-bestiary/the-stag-lord"]).toBe("Seigneur Cerf");
  });
});

describe("loadConditionsI18n", () => {
  it("reads a condition that may lack a French body", async () => {
    const conditions = await loadConditionsI18n(
      fakeFetch({ grabbed: { name: "Agrippé", description: null } }),
    );
    expect(conditions.grabbed).toEqual({ name: "Agrippé", description: null });
  });
});

describe("loadGlossaryI18n", () => {
  it("reads a glossary entry", async () => {
    const glossary = await loadGlossaryI18n(
      fakeFetch({ grab: { name: "Empoignade", description: "<p>...</p>" } }),
    );
    expect(glossary.grab).toEqual({ name: "Empoignade", description: "<p>...</p>" });
  });
});

describe("loadTraitsI18n", () => {
  it("reads a trait, including one with no French display name", async () => {
    const traits = await loadTraitsI18n(
      fakeFetch({
        acid: { name: "Acide", description: "Les effets..." },
        coatl: { name: null, description: "Une famille de serpents..." },
      }),
    );
    expect(traits.acid).toEqual({ name: "Acide", description: "Les effets..." });
    expect(traits.coatl).toEqual({ name: null, description: "Une famille de serpents..." });
  });
});
