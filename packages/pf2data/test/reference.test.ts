import { describe, expect, it, afterAll } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveLocalize } from "../src/normalize/localize.js";
import type { Creature } from "@pf2/schema";
import {
  buildConditions,
  buildStandardActions,
  buildTraits,
  buildVocabulary,
  scanVocabulary,
} from "../src/stages/reference.js";

describe("resolveLocalize", () => {
  it("substitutes a localization key with its text", () => {
    const lang = {
      "PF2E.NPC.Abilities.Glossary.Grab": "<p>The monster grabs you.</p>",
    };
    expect(
      resolveLocalize("<p>@Localize[PF2E.NPC.Abilities.Glossary.Grab]</p>", lang),
    ).toBe("<p><p>The monster grabs you.</p></p>");
  });

  it("leaves an unknown key untouched so it is visible in verification", () => {
    const html = "<p>@Localize[PF2E.Missing.Key]</p>";
    expect(resolveLocalize(html, {})).toBe(html);
  });

  it("resolves every key in a document", () => {
    const lang = { A: "one", B: "two" };
    expect(resolveLocalize("@Localize[A] and @Localize[B]", lang)).toBe(
      "one and two",
    );
  });

  it("leaves text without localize markers untouched", () => {
    expect(resolveLocalize("<p>plain</p>", {})).toBe("<p>plain</p>");
  });
});

describe("buildConditions", () => {
  const tmpDirs: string[] = [];
  afterAll(() => {
    for (const dir of tmpDirs) rmSync(dir, { recursive: true, force: true });
  });

  it("reads whatever pack name config supplies, not a hardcoded directory", () => {
    const packsDir = mkdtempSync(join(tmpdir(), "reference-packs-"));
    tmpDirs.push(packsDir);

    // Deliberately not named "conditions" — proves buildConditions is driven
    // by the `packs` argument, not a hardcoded directory name.
    const packDir = join(packsDir, "custom-condition-pack");
    mkdirSync(packDir, { recursive: true });
    writeFileSync(
      join(packDir, "prone.json"),
      JSON.stringify({
        name: "Prone",
        type: "condition",
        system: {
          description: { value: "<p>You are lying on the ground.</p>" },
          value: { isValued: false },
        },
      }),
    );

    const conditions = buildConditions(packsDir, {}, ["custom-condition-pack"]);

    expect(conditions).toEqual([
      {
        slug: "prone",
        name: "Prone",
        isValued: false,
        description: "<p>You are lying on the ground.</p>",
      },
    ]);
  });

  it("resolves @Localize placeholders in a condition description, like buildGlossary does", () => {
    const packsDir = mkdtempSync(join(tmpdir(), "reference-packs-"));
    tmpDirs.push(packsDir);

    const packDir = join(packsDir, "conditions");
    mkdirSync(packDir, { recursive: true });
    writeFileSync(
      join(packDir, "frightened.json"),
      JSON.stringify({
        name: "Frightened",
        type: "condition",
        system: {
          description: { value: "<p>@Localize[PF2E.ConditionsGlossary.Frightened]</p>" },
          value: { isValued: true },
        },
      }),
    );

    const lang = { "PF2E.ConditionsGlossary.Frightened": "<p>You are gripped by fear.</p>" };
    const conditions = buildConditions(packsDir, lang, ["conditions"]);

    expect(conditions[0]!.description).toContain("You are gripped by fear.");
    expect(conditions[0]!.description).not.toContain("@Localize[");
  });
});

describe("buildTraits", () => {
  it("derives slug and name from PF2E.TraitDescription* / PF2E.Trait* keys", () => {
    const lang = {
      "PF2E.TraitDescriptionAgile": "Lowers the multiple attack penalty.",
      "PF2E.TraitAgile": "Agile",
    };
    expect(buildTraits(lang)).toEqual([
      { slug: "agile", name: "Agile", description: "Lowers the multiple attack penalty." },
    ]);
  });

  it("splits an internal-capital suffix into a kebab-case slug", () => {
    const lang = {
      "PF2E.TraitDescriptionAwakenedAnimal": "An animal given sentience.",
      "PF2E.TraitAwakenedAnimal": "Awakened Animal",
    };
    expect(buildTraits(lang)[0]!.slug).toBe("awakened-animal");
  });

  it("splits a letter-to-digit boundary too (Splash10 -> splash-10)", () => {
    const lang = { "PF2E.TraitDescriptionSplash10": "Splash damage description." };
    expect(buildTraits(lang)[0]!.slug).toBe("splash-10");
  });

  it("falls back to a title-cased slug when no PF2E.Trait<Suffix> name key exists", () => {
    const lang = { "PF2E.TraitDescriptionMonkWeapon": "A monk weapon." };
    expect(buildTraits(lang)[0]!).toEqual({
      slug: "monk-weapon",
      name: "Monk Weapon",
      description: "A monk weapon.",
    });
  });

  it("resolves @Localize and @UUID markers in the description, like the other reference builders", () => {
    const lang = {
      "PF2E.TraitDescriptionAgile": "See @Localize[PF2E.Other] and @UUID[Compendium.pf2e.x.Item.y]{Z}.",
      "PF2E.Other": "elsewhere",
    };
    const [trait] = buildTraits(lang);
    expect(trait!.description).toBe("See elsewhere and Z.");
  });

  it("ignores keys that aren't PF2E.TraitDescription*", () => {
    const lang = {
      "PF2E.TraitAgile": "Agile",
      "PF2E.NPC.Abilities.Glossary.Grab": "The monster grabs you.",
    };
    expect(buildTraits(lang)).toEqual([]);
  });

  it("sorts by slug with compareStrings", () => {
    const lang = {
      "PF2E.TraitDescriptionZealous": "z",
      "PF2E.TraitDescriptionAgile": "a",
      "PF2E.TraitDescriptionMagical": "m",
    };
    expect(buildTraits(lang).map((t) => t.slug)).toEqual(["agile", "magical", "zealous"]);
  });
});

describe("buildStandardActions", () => {
  const tmpDirs: string[] = [];
  afterAll(() => {
    for (const dir of tmpDirs) rmSync(dir, { recursive: true, force: true });
  });

  /** One upstream `action` item, shaped like `packs/actions/<folder>/*.json`. */
  const item = (
    name: string,
    actionType: string,
    actions: number | null,
    extra: { traits?: string[]; description?: string; slug?: string } = {},
  ): unknown => ({
    name,
    type: "action",
    system: {
      ...(extra.slug !== undefined ? { slug: extra.slug } : {}),
      actionType: { value: actionType },
      actions: { value: actions },
      description: { value: extra.description ?? `<p>${name}.</p>` },
      traits: { value: extra.traits ?? [] },
    },
  });

  /** Lays out an `actions` pack: `{ "basic-actions/stride": item, ... }`. */
  function seedPack(files: Record<string, unknown>): string {
    const packsDir = mkdtempSync(join(tmpdir(), "standard-actions-"));
    tmpDirs.push(packsDir);
    for (const [path, content] of Object.entries(files)) {
      const abs = join(packsDir, "actions", `${path}.json`);
      mkdirSync(join(abs, ".."), { recursive: true });
      writeFileSync(abs, JSON.stringify(content));
    }
    // Both folders always exist upstream; a fixture that only seeds one
    // still needs the other to be walkable.
    mkdirSync(join(packsDir, "actions", "basic-actions"), { recursive: true });
    mkdirSync(join(packsDir, "actions", "skill-actions"), { recursive: true });
    return packsDir;
  }

  it("keeps actions, reactions and free actions; drops passives, Delay and Strike", () => {
    const packsDir = seedPack({
      "basic-actions/stride": item("Stride", "action", 1, { traits: ["move"] }),
      "basic-actions/aid": item("Aid", "reaction", null),
      "basic-actions/release": item("Release", "free", null, { traits: ["manipulate"] }),
      "basic-actions/delay": item("Delay", "free", null),
      "basic-actions/strike": item("Strike", "action", 1, { traits: ["attack"] }),
      "skill-actions/high-jump": item("High Jump", "action", 2, { traits: ["move"] }),
      "skill-actions/earn-income": item("Earn Income", "passive", null, { traits: ["downtime"] }),
      // Loose at the pack root, like the ~790 class and archetype actions:
      // never read.
      "a-challenge-for-heroes": item("A Challenge for Heroes", "action", 1),
    });

    expect(buildStandardActions(packsDir, {}, ["actions"])).toEqual([
      { slug: "aid", name: "Aid", cost: "reaction", category: "basic", traits: [], description: "<p>Aid.</p>" },
      { slug: "high-jump", name: "High Jump", cost: "2", category: "skill", traits: ["move"], description: "<p>High Jump.</p>" },
      { slug: "release", name: "Release", cost: "free", category: "basic", traits: ["manipulate"], description: "<p>Release.</p>" },
      { slug: "stride", name: "Stride", cost: "1", category: "basic", traits: ["move"], description: "<p>Stride.</p>" },
    ]);
  });

  it("prefers upstream's system.slug over the file stem", () => {
    const packsDir = seedPack({
      "basic-actions/take-cover-old": item("Take Cover", "action", 1, { slug: "take-cover" }),
    });
    expect(buildStandardActions(packsDir, {}, ["actions"]).map((a) => a.slug)).toEqual([
      "take-cover",
    ]);
  });

  it("resolves @Localize then @UUID in the description, like creature actions", () => {
    const packsDir = seedPack({
      "basic-actions/escape": item("Escape", "action", 1, {
        description: "<p>@Localize[PF2E.Key]</p>",
      }),
    });
    const lang = { "PF2E.Key": "You stop being @UUID[Compendium.pf2e.conditionitems.Item.Grabbed]." };
    expect(buildStandardActions(packsDir, lang, ["actions"])[0]!.description).toBe(
      "<p>You stop being Grabbed.</p>",
    );
  });

  it("throws on an item that fails validation instead of silently dropping it", () => {
    const packsDir = seedPack({
      "skill-actions/shove": { name: "Shove", type: "action", system: { actionType: { value: "action" } } },
    });
    expect(() => buildStandardActions(packsDir, {}, ["actions"])).toThrow(
      /actions\/skill-actions\/shove.*failed validation/,
    );
  });

  it("throws on an action with no 1-3 action count -- there is no passive cost to fall back to", () => {
    const packsDir = seedPack({ "basic-actions/stride": item("Stride", "action", null) });
    expect(() => buildStandardActions(packsDir, {}, ["actions"])).toThrow(/no 1-3 action count/);
  });

  it("throws when two folders yield the same slug", () => {
    const packsDir = seedPack({
      "basic-actions/climb": item("Climb", "action", 1),
      "skill-actions/climb": item("Climb", "action", 1),
    });
    expect(() => buildStandardActions(packsDir, {}, ["actions"])).toThrow(/"climb" appears twice/);
  });

  it("reads no directory at all when config has no actions-kind pack", () => {
    expect(buildStandardActions("/nonexistent", {}, [])).toEqual([]);
  });
});

/** The twelve attribute keys `buildVocabulary` refuses to do without. */
const ATTRIBUTE_LANG: Record<string, string> = {
  "PF2E.AbilityStr": "Strength",
  "PF2E.AbilityDex": "Dexterity",
  "PF2E.AbilityCon": "Constitution",
  "PF2E.AbilityInt": "Intelligence",
  "PF2E.AbilityWis": "Wisdom",
  "PF2E.AbilityCha": "Charisma",
  "PF2E.AbilityId.str": "Str",
  "PF2E.AbilityId.dex": "Dex",
  "PF2E.AbilityId.con": "Con",
  "PF2E.AbilityId.int": "Int",
  "PF2E.AbilityId.wis": "Wis",
  "PF2E.AbilityId.cha": "Cha",
};

describe("scanVocabulary", () => {
  it("takes languages by their lowercase slug key, never the PascalCase UI strings beside them", () => {
    const v = scanVocabulary({
      "PF2E.Actor.Creature.Language.aklo": "Aklo",
      "PF2E.Actor.Creature.Language.elder-thing": "Elder Thing",
      "PF2E.Actor.Creature.Language.grippli": "Tripkee",
      "PF2E.Actor.Creature.Language.CommonLanguage": "Common ({language})",
      "PF2E.Actor.Creature.Language.Plural": "Languages",
    });
    expect(v.languages).toEqual({ aklo: "Aklo", "elder-thing": "Elder Thing", grippli: "Tripkee" });
  });

  it("slugs PascalCase keys like a trait and leaves out each family's Label", () => {
    const v = scanVocabulary({
      "PF2E.Actor.Creature.Sense.Type.LowLightVision": "Low-Light Vision",
      "PF2E.Actor.Creature.Sense.Type.SeeInvisibility": "See the Unseen",
      "PF2E.Actor.Creature.Sense.Acuity.Imprecise": "Imprecise",
      "PF2E.Actor.Creature.Sense.Acuity.Label": "Acuity",
      "PF2E.Skill.Athletics": "Athletics",
      "PF2E.Actor.Speed.Type.Land": "Land",
      "PF2E.Actor.Speed.Type.Label": "{type} Speed",
      "PF2E.ActorSizeGargantuan": "Gargantuan",
    });
    expect(v.senses).toEqual({ "low-light-vision": "Low-Light Vision", "see-invisibility": "See the Unseen" });
    expect(v.acuities).toEqual({ imprecise: "Imprecise" });
    expect(v.skills).toEqual({ athletics: "Athletics" });
    expect(v.speeds).toEqual({ land: "Land" });
    expect(v.sizes).toEqual({ gargantuan: "Gargantuan" });
  });

  it("looks rarities up among the trait names for the four creature rarities only", () => {
    const v = scanVocabulary({ "PF2E.TraitUnique": "Unique", "PF2E.TraitAgile": "Agile" });
    expect(v.rarities).toEqual({ unique: "Unique" });
  });

  it("keeps a missing attribute half as null", () => {
    const v = scanVocabulary({ "PF2E.AbilityStr": "Force" });
    expect(v.attributes.str).toEqual({ name: "Force", short: null });
    expect(v.attributes.cha).toEqual({ name: null, short: null });
  });
});

describe("buildVocabulary", () => {
  const withSpeeds = (...types: string[]): Creature =>
    ({ speeds: types.map((type) => ({ type, value: 20 })) }) as Creature;

  it("names each attribute and its short form", () => {
    expect(buildVocabulary(ATTRIBUTE_LANG, []).attributes.str).toEqual({ name: "Strength", short: "Str" });
  });

  it("throws when an attribute has no English short form", () => {
    const { "PF2E.AbilityId.wis": _wis, ...lang } = ATTRIBUTE_LANG;
    expect(() => buildVocabulary(lang, [])).toThrow(/wis has no PF2E\.AbilityId\.wis/);
  });

  it("title-cases a speed a creature uses with no lang key, and only speeds", () => {
    const v = buildVocabulary(
      { ...ATTRIBUTE_LANG, "PF2E.Actor.Speed.Type.Fly": "Fly" },
      [withSpeeds("land", "fly", "ice-burrow")],
    );
    expect(v.speeds).toEqual({ fly: "Fly", land: "Land", "ice-burrow": "Ice Burrow" });
    expect(v.languages).toEqual({});
  });
});
