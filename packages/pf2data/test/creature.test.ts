import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { CreatureSchema } from "@pf2/schema";
import { normalizeCreature, normalizeCreatureWithItems } from "../src/normalize/creature.js";

const load = (name: string) =>
  JSON.parse(
    readFileSync(
      fileURLToPath(new URL(`./fixtures/${name}.json`, import.meta.url)),
      "utf8",
    ),
  );

const GLOSSARY_LANG = {
  "PF2E.NPC.Abilities.Glossary.ConstantSpells": "<p>Always active.</p>",
  "PF2E.NPC.Abilities.Glossary.ChangeShape": "<p>Change shape.</p>",
};

describe("normalizeCreature", () => {
  it("produces a schema-valid creature", () => {
    const c = normalizeCreature(
      load("the-stag-lord"),
      "kingmaker-bestiary",
      "the-stag-lord",
      {},
    );
    expect(() => CreatureSchema.parse(c)).not.toThrow();
  });

  it("builds the id from pack and slug", () => {
    const c = normalizeCreature(
      load("the-stag-lord"),
      "kingmaker-bestiary",
      "the-stag-lord",
      {},
    );
    expect(c.id).toBe("kingmaker-bestiary/the-stag-lord");
    expect(c.name).toBe("The Stag Lord");
    expect(c.level).toBe(6);
    expect(c.source.remaster).toBe(false);
    expect(c.source.license).toBe("OGL");
  });

  it("keeps treasure and other carried items in gear", () => {
    const akiros = normalizeCreature(
      load("akiros-ismort"),
      "kingmaker-bestiary",
      "akiros-ismort",
      {},
    );
    expect(akiros.gear).toContain("Silver Stag Lord Amulet");
    expect(akiros.gear).toContain("Gold Pieces");
  });

  it("keeps gear free of items the other normalizers own", () => {
    const nyrissa = normalizeCreature(
      load("nyrissa"),
      "kingmaker-bestiary",
      "nyrissa",
      GLOSSARY_LANG,
    );
    expect(nyrissa.gear).not.toContain("Wish");
    expect(nyrissa.gear).not.toContain("Arcane Spontaneous Spells");
    expect(nyrissa.gear).not.toContain("First World Lore");
  });

  it("carries actions, attacks and spellcasting through", () => {
    const nyrissa = normalizeCreature(
      load("nyrissa"),
      "kingmaker-bestiary",
      "nyrissa",
      GLOSSARY_LANG,
    );
    expect(nyrissa.spellcasting).toHaveLength(3);
    expect(nyrissa.actions.length).toBeGreaterThan(0);
    expect(nyrissa.attacks.length).toBeGreaterThan(0);
  });

  it("leaves no unresolved uuid link in emitted text", () => {
    const nyrissa = normalizeCreature(
      load("nyrissa"),
      "kingmaker-bestiary",
      "nyrissa",
      GLOSSARY_LANG,
    );
    expect(JSON.stringify(nyrissa)).not.toContain("@UUID[");
  });

  it("resolves @Localize placeholders (Constant Spells, Change Shape) given a lang table", () => {
    const nyrissa = normalizeCreature(
      load("nyrissa"),
      "kingmaker-bestiary",
      "nyrissa",
      GLOSSARY_LANG,
    );
    expect(JSON.stringify(nyrissa)).not.toContain("@Localize[");
    const constantSpells = nyrissa.actions.find((a) => a.name === "Constant Spells")!;
    expect(constantSpells.description).toContain("Always active.");
  });

  it("includes the creature's identity in a normalizeTraits failure message", () => {
    const bad = load("the-stag-lord");
    bad.system.traits.size.value = "unknown-size-code";
    expect(() =>
      normalizeCreature(bad, "kingmaker-bestiary", "the-stag-lord", {}),
    ).toThrow(/kingmaker-bestiary\/the-stag-lord.*unknown-size-code|unknown-size-code.*kingmaker-bestiary\/the-stag-lord/is);
  });
});

describe("normalizeCreatureWithItems", () => {
  // `CreatureSchema.parse` strips `foundryId` off every action and attack, so
  // the emitted creature carries no item ids at all. The French overlay is
  // keyed by Foundry item id and aligned to those same sorted arrays by
  // POSITION, so the ids have to escape normalisation alongside the creature
  // -- from the SAME pass, not a second one that could sort differently.
  const { creature, items } = normalizeCreatureWithItems(
    load("the-stag-lord"),
    "kingmaker-bestiary",
    "the-stag-lord",
    {},
  );

  it("returns the same creature normalizeCreature does", () => {
    expect(creature).toEqual(
      normalizeCreature(load("the-stag-lord"), "kingmaker-bestiary", "the-stag-lord", {}),
    );
  });

  it("aligns item ids to the creature's own sorted arrays, position for position", () => {
    expect(items.actions.map((a) => a.name)).toEqual(
      creature.actions.map((a) => a.name),
    );
    expect(items.attacks.map((a) => a.name)).toEqual(
      creature.attacks.map((a) => a.name),
    );
    expect(items.attacks.every((a) => a.foundryId.length > 0)).toBe(true);
  });

  it("finds each id back in the source actor", () => {
    const raw = load("the-stag-lord");
    const ids = new Set(raw.items.map((i: { _id: string }) => i._id));
    for (const attack of items.attacks) expect(ids.has(attack.foundryId)).toBe(true);
    for (const action of items.actions) expect(ids.has(action.foundryId)).toBe(true);
  });
});
