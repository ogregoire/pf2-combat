import { describe, expect, it, afterAll } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveLocalize } from "../src/normalize/localize.js";
import { buildConditions, buildTraits } from "../src/stages/reference.js";

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
