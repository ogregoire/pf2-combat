import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { ActiveCombatant } from "../src/components/ActiveCombatant.js";
import { clearCreatureCache } from "../src/data/creatures.js";
import { __resetVocabularyCacheForTests } from "../src/hooks/useVocabulary.js";
import { auraRadius, auras, recallKnowledge } from "../src/rules/recallKnowledge.js";
import { useEncounter } from "../src/state/store.js";

const state = () => useEncounter.getState();
const presence = { name: "Frightful Presence", cost: "passive", traits: ["aura", "emotion"], frequency: null, trigger: null, requirements: null, category: "defensive", description: "<p>90 feet. @Check[will|dc:26]</p>" };
const telepathy = { ...presence, name: "Telepathy 100 feet", traits: ["aura", "magical"], description: "<p>Speaks mind to mind.</p>" };

describe("Recall Knowledge and auras", () => {
  beforeEach(() => {
    state().reset();
    clearCreatureCache();
    __resetVocabularyCacheForTests();
  });

  it("gives the DC by level and rarity, and the skills by trait", () => {
    expect(recallKnowledge(7, "unique", ["fey", "small"])).toEqual({ dc: 33, skills: ["nature"] });
    expect(recallKnowledge(-1, "common", ["construct"])).toEqual({ dc: 13, skills: ["arcana", "crafting"] });
    expect(recallKnowledge(3, "rare", ["dragon", "fire"]).dc).toBe(23);
  });

  it("reads an aura's radius, leaving telepathy out", () => {
    expect(auraRadius(presence.description)).toBe(90);
    expect(auraRadius("<p>The @Template[emanation|distance:30] burns.</p>")).toBe(30);
    expect(auras([presence, telepathy]).map((a) => a.name)).toEqual(["Frightful Presence"]);
  });

  it("shows both in the stat block, and the aura on the row's chips", async () => {
    state().addCombatant(
      { kind: "creature", name: "Dragon", level: 8, ac: 27, saves: { fortitude: 17, reflex: 14, will: 15 }, hp: { current: 150, max: 150 },
        creatureId: "b/dragon", actions: [presence, telepathy] },
      20,
    );
    const fetchFn = async (url: string): Promise<Response> =>
      url.includes("creatures/b/dragon.json")
        ? new Response(JSON.stringify({ rarity: "rare", size: "huge", traits: ["dragon", "fire"], perception: 16, skills: {}, abilityMods: {}, speeds: [], languages: [], senses: [], gear: [] }))
        : new Response(url.includes("vocabulary") ? JSON.stringify({ skills: { arcana: "Arcana" } }) : "[]");
    render(<ActiveCombatant fetchFn={fetchFn} />);
    await waitFor(() => expect(screen.getByTestId("creature-details").textContent).toContain("Recall Knowledge DC 29 (Arcana)"));
    expect(screen.getByTestId("creature-details").textContent).toContain("Auras Frightful Presence 90 feet");
  });
});
