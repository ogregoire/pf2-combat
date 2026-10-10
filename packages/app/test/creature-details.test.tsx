import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { ActiveCombatant } from "../src/components/ActiveCombatant.js";
import { clearCreatureCache } from "../src/data/creatures.js";
import { __resetVocabularyCacheForTests } from "../src/hooks/useVocabulary.js";
import { useEncounter } from "../src/state/store.js";

const rigg = {
  rarity: "unique", size: "small", traits: ["fey"], perception: 15,
  senses: [{ type: "low-light-vision", acuity: null, range: null }, { type: "scent", acuity: "imprecise", range: 30 }],
  languages: ["aklo", "common"], skills: { stealth: 17, acrobatics: 17 },
  abilityMods: { str: 0, dex: 6, con: 2, int: 4, wis: 2, cha: 4 },
  speeds: [{ type: "land", value: 100 }, { type: "fly", value: 40 }],
  gear: ["Shortsword"], spellcasting: [],
};
const vocabulary = {
  languages: { aklo: "Aklo", common: "Common" }, senses: { "low-light-vision": "Low-Light Vision", scent: "Scent" },
  acuities: { imprecise: "imprecise" }, skills: { stealth: "Stealth", acrobatics: "Acrobatics" }, speeds: { land: "Land", fly: "Fly" },
  attributes: { str: { name: "Strength", short: "Str" }, dex: { name: "Dexterity", short: "Dex" }, con: { name: "Constitution", short: "Con" },
    int: { name: "Intelligence", short: "Int" }, wis: { name: "Wisdom", short: "Wis" }, cha: { name: "Charisma", short: "Cha" } },
  sizes: { small: "Small" }, rarities: { unique: "Unique" },
};
const vocabularyFr = {
  languages: { common: "Commun" }, senses: { "low-light-vision": "Vision nocturne", scent: "Odorat" }, acuities: { imprecise: "imprécis" },
  skills: { stealth: "Discrétion", acrobatics: "Acrobaties" }, speeds: { fly: "Vol" },
  attributes: { str: { name: "Force", short: "For" }, dex: { name: "Dextérité", short: "Dex" } },
};
const fetchFn = async (url: string): Promise<Response> => {
  if (url.includes("creatures/kingmaker-bestiary/rigg-gargadilly.json")) return new Response(JSON.stringify(rigg));
  if (url.endsWith("i18n/fr/vocabulary.json")) return new Response(JSON.stringify(vocabularyFr));
  if (url.endsWith("data/vocabulary.json")) return new Response(JSON.stringify(vocabulary));
  return new Response("[]");
};
const add = (): string =>
  useEncounter.getState().addCombatant(
    { kind: "creature", name: "Rigg Gargadilly", creatureId: "kingmaker-bestiary/rigg-gargadilly", level: 7, ac: 26,
      saves: { fortitude: 12, reflex: 18, will: 13 }, hp: { current: 100, max: 100 } },
    20,
  );

describe("CreatureDetails", () => {
  beforeEach(() => {
    useEncounter.getState().reset();
    clearCreatureCache();
    __resetVocabularyCacheForTests();
  });

  it("shows perception and senses, languages, skills, attributes, speeds and items under the name", async () => {
    add();
    render(<ActiveCombatant fetchFn={fetchFn} />);
    await waitFor(() => expect(screen.getByTestId("creature-details").textContent).toContain("Aklo, Common"));
    const text = screen.getByTestId("creature-details").textContent!;
    expect(text).toContain("Perception +15; Low-Light Vision, Scent (imprecise, 30 feet)");
    expect(text).toContain("Skills Acrobatics +17, Stealth +17");
    expect(text).toContain("Str +0, Dex +6, Con +2, Int +4, Wis +2, Cha +4");
    expect(text).toContain("Speed 100 feet, fly 40 feet");
    expect(text).toContain("Items Shortsword");
  });

  it("applies elite/weak and condition penalties to Perception and skills", async () => {
    const id = add();
    useEncounter.getState().setAdjustment(id, "elite");
    useEncounter.getState().addCondition(id, "frightened", 1);
    render(<ActiveCombatant fetchFn={fetchFn} />);
    await waitFor(() => expect(screen.getByTestId("creature-details").textContent).toContain("Perception +16"));
    expect(screen.getByTestId("creature-details").textContent).toContain("Stealth +18");
  });

  it("reads in French, with distances in metres, falling back to English names", async () => {
    useEncounter.getState().setLang("fr");
    add();
    render(<ActiveCombatant fetchFn={fetchFn} />);
    await waitFor(() => expect(screen.getByTestId("creature-details").textContent).toContain("Vision nocturne"));
    const text = screen.getByTestId("creature-details").textContent!;
    expect(text).toContain("Odorat (imprécis, 9 m)");
    expect(text).toContain("Langues Aklo, Commun");
    expect(text).toContain("Compétences Acrobaties +17, Discrétion +17");
    expect(text).toContain("For +0");
    expect(text).toContain("Vitesse 30 m, vol 12 m");
  });
});
