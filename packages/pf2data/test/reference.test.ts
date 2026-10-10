import { describe, expect, it, afterAll } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveLocalize } from "../src/normalize/localize.js";
import {
  buildConditions,
  buildStandardActions,
  buildTraits,
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
