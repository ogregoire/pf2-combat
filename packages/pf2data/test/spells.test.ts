import { afterAll, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildSpellDetails,
  compendiumSpellSlugs,
  loadCompendiumSpells,
  type CompendiumSpells,
  type SpellCopy,
} from "../src/stages/spells.js";

const tmpDirs: string[] = [];
afterAll(() => {
  for (const dir of tmpDirs) rmSync(dir, { recursive: true, force: true });
});

/** An upstream spell item in the shape the compendium and the creatures'
 * embedded copies share. */
function spellItem(
  id: string,
  name: string,
  overrides: Record<string, unknown> = {},
  extra: Record<string, unknown> = {},
) {
  return {
    _id: id,
    name,
    type: "spell",
    ...extra,
    system: {
      slug: null,
      level: { value: 3 },
      traits: { rarity: "common", traditions: ["primal", "arcane"], value: ["manipulate", "fire", "concentrate"] },
      time: { value: "2" },
      range: { value: "500 feet" },
      area: { type: "burst", value: 20 },
      target: { value: "" },
      defense: { save: { basic: true, statistic: "reflex" } },
      duration: { sustained: false, value: "" },
      description: { value: `<p>${name} text.</p>` },
      ...overrides,
    },
  };
}

/** A real `spells` pack on disk: `packs/spells/<folder>/<stem>.json`. */
function compendiumOf(files: Record<string, unknown>): { packsDir: string; compendium: CompendiumSpells } {
  const packsDir = mkdtempSync(join(tmpdir(), "spells-fixture-"));
  tmpDirs.push(packsDir);
  mkdirSync(join(packsDir, "spells"));
  for (const [path, content] of Object.entries(files)) {
    const full = join(packsDir, "spells", path);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, JSON.stringify(content));
  }
  return { packsDir, compendium: loadCompendiumSpells(packsDir, ["spells"]) };
}

const source = (id: string) => ({ _stats: { compendiumSource: `Compendium.pf2e.spells-srd.Item.${id}` } });

function copy(creatureId: string, foundryId: string, slug: string, item: unknown): SpellCopy {
  return { creatureId, creatureName: creatureId, creatureFoundryId: `${creatureId}-id`, foundryId, slug, item };
}

describe("loadCompendiumSpells", () => {
  it("indexes every spell by id and by slug (system.slug, else file stem)", () => {
    const { compendium } = compendiumOf({
      "3rd-rank/fireball.json": spellItem("FIREBALL", "Fireball"),
      "focus/odd-stem.json": spellItem("FOCUS", "Focus", { slug: "own-slug" }),
    });
    expect(compendium.byId.get("FIREBALL")!.slug).toBe("fireball");
    expect(compendium.bySlug.get("own-slug")!.name).toBe("Focus");
    expect(compendiumSpellSlugs(compendium)).toEqual(
      new Map([
        ["FIREBALL", "fireball"],
        ["FOCUS", "own-slug"],
      ]),
    );
  });

  it("throws on a file that is not a spell instead of skipping it", () => {
    expect(() => compendiumOf({ "x/feat.json": { _id: "F", name: "Feat", type: "feat", system: {} } })).toThrow(
      /not a spell item/,
    );
  });

  it("throws when two spells share a slug -- it is the join key", () => {
    expect(() =>
      compendiumOf({
        "1st-rank/a.json": spellItem("A", "A", { slug: "same" }),
        "2nd-rank/b.json": spellItem("B", "B", { slug: "same" }),
      }),
    ).toThrow(/appears twice/);
  });

  it("reads no directory at all when config has no spells-kind pack", () => {
    const compendium = loadCompendiumSpells("/nonexistent", []);
    expect(compendium.byId.size).toBe(0);
  });
});

describe("buildSpellDetails", () => {
  it("builds a detail from the compendium spell, fields mapped and normalised", () => {
    const { compendium } = compendiumOf({
      "3rd-rank/fireball.json": spellItem("FIREBALL", "Fireball", {
        description: { value: "<p>See @UUID[Compendium.pf2e.conditionitems.Item.x]{Off-Guard} and @Localize[K].</p>" },
      }),
    });
    const embedded = spellItem("c1", "Fireball (At Will)", { description: { value: "<p>edited</p>" } }, source("FIREBALL"));
    const build = buildSpellDetails([copy("p/a", "c1", "fireball", embedded)], compendium, { K: "localized" });

    expect(build.details).toEqual([
      {
        slug: "fireball",
        name: "Fireball",
        rank: 3,
        cantrip: false,
        traits: ["concentrate", "fire", "manipulate"],
        traditions: ["arcane", "primal"],
        cost: "2",
        range: "500 feet",
        area: { type: "burst", value: 20 },
        targets: null,
        defense: { save: "reflex", basic: true },
        duration: null,
        sustained: false,
        description: "<p>See Off-Guard and localized.</p>",
      },
    ]);
    expect(build.sources.get("fireball")).toEqual({ kind: "compendium", name: "Fireball" });
    expect(build.stats).toMatchObject({ compendium: 1, embedded: 0, compendiumCopies: 1, differingCopies: 1 });
  });

  it("nulls empty text fields and a passive-only defense, and reads cantrip from traits", () => {
    const { compendium } = compendiumOf({
      "cantrip/shield.json": spellItem("SHIELD", "Shield", {
        level: { value: 1 },
        traits: { traditions: [], value: ["cantrip", "force"] },
        range: { value: "" },
        area: null,
        target: { value: "you" },
        defense: { passive: { statistic: "ac" }, save: null },
        duration: { sustained: true, value: "until the start of your next turn" },
      }),
    });
    const [detail] = buildSpellDetails(
      [copy("p/a", "c1", "shield", spellItem("c1", "Shield", {}, source("SHIELD")))],
      compendium,
      {},
    ).details;
    expect(detail).toMatchObject({
      rank: 1,
      cantrip: true,
      traditions: [],
      range: null,
      area: null,
      targets: "you",
      defense: null,
      duration: "until the start of your next turn",
      sustained: true,
    });
  });

  it("matches the compendium by slug when the copy has no source id", () => {
    const { compendium } = compendiumOf({ "3rd-rank/fireball.json": spellItem("FIREBALL", "Fireball") });
    const build = buildSpellDetails([copy("p/a", "c1", "fireball", spellItem("c1", "Fireball"))], compendium, {});
    expect(build.sources.get("fireball")!.kind).toBe("compendium");
  });

  it("keeps a renamed legacy spell's own text instead of the spell its id now names", () => {
    // Legacy "Dimension Door" items point at the id that now holds Translocate.
    const { compendium } = compendiumOf({ "4th-rank/translocate.json": spellItem("TRANSLOCATE", "Translocate") });
    const legacy = spellItem("c1", "Dimension Door (At Will)", { level: { value: 4 } }, source("TRANSLOCATE"));
    const build = buildSpellDetails([copy("p/a", "c1", "dimension-door", legacy)], compendium, {});

    expect(build.details[0]).toMatchObject({ slug: "dimension-door", name: "Dimension Door", rank: 4 });
    expect(build.details[0]!.description).toBe("<p>Dimension Door (At Will) text.</p>");
    expect(build.sources.get("dimension-door")!.kind).toBe("embedded");
    expect(build.stats).toMatchObject({ compendium: 0, embedded: 1, renamedCopies: 1 });
  });

  it("uses the MOST COMMON embedded copy, not the first one", () => {
    const { compendium } = compendiumOf({});
    const pre = spellItem("x", "Burning Hands (At Will)", { description: { value: "<p>12d6</p>" } });
    const plain = (id: string) => spellItem(id, "Burning Hands", { description: { value: "<p>2d6</p>" } });
    const build = buildSpellDetails(
      [
        copy("p/a-dragon", "x", "burning-hands", pre),
        copy("p/b", "y", "burning-hands", plain("y")),
        copy("p/c", "z", "burning-hands", plain("z")),
      ],
      compendium,
      {},
    );
    expect(build.details[0]!.description).toBe("<p>2d6</p>");
    const source = build.sources.get("burning-hands");
    expect(source?.kind === "embedded" && source.copies.map((c) => c.creatureId)).toEqual([
      "p/b",
      "p/a-dragon",
      "p/c",
    ]);
  });

  it("breaks a tie on the first copy, and does not let a prepared repeat vote twice", () => {
    const { compendium } = compendiumOf({});
    const a = spellItem("a", "Veil", { description: { value: "<p>A</p>" } });
    const b = spellItem("b", "Veil", { description: { value: "<p>B</p>" } });
    // Creature p/b holds its copy at two ranks: two rows, one copy.
    const build = buildSpellDetails(
      [copy("p/a", "a", "veil", a), copy("p/b", "b", "veil", b), copy("p/b", "b", "veil", b)],
      compendium,
      {},
    );
    expect(build.details[0]!.description).toBe("<p>A</p>");
  });

  it("emits one detail per distinct slug, sorted, and none for unreferenced compendium spells", () => {
    const { compendium } = compendiumOf({
      "3rd-rank/fireball.json": spellItem("FIREBALL", "Fireball"),
      "1st-rank/unused.json": spellItem("UNUSED", "Unused"),
    });
    const build = buildSpellDetails(
      [
        copy("p/a", "1", "fireball", spellItem("1", "Fireball", {}, source("FIREBALL"))),
        copy("p/b", "2", "fireball", spellItem("2", "Fireball", {}, source("FIREBALL"))),
        copy("p/b", "3", "custom", spellItem("3", "Custom")),
      ],
      compendium,
      {},
    );
    expect(build.details.map((d) => d.slug)).toEqual(["custom", "fireball"]);
    expect(build.stats).toMatchObject({ compendium: 1, embedded: 1, compendiumCopies: 2, differingCopies: 0 });
  });

  it("counts a detail that heightens only through system.heightening", () => {
    const { compendium } = compendiumOf({
      "1st-rank/a.json": spellItem("A", "A", { heightening: { type: "interval", interval: 1 } }),
      "1st-rank/b.json": spellItem("B", "B", {
        heightening: { type: "interval", interval: 1 },
        description: { value: "<p><strong>Heightened (+1)</strong> more.</p>" },
      }),
    });
    const build = buildSpellDetails(
      [copy("p/a", "1", "a", spellItem("1", "A")), copy("p/a", "2", "b", spellItem("2", "B"))],
      compendium,
      {},
    );
    expect(build.stats.heighteningOnly).toBe(1);
  });

  it("throws on a referenced spell it cannot read instead of dropping it", () => {
    const { compendium } = compendiumOf({});
    const broken = spellItem("1", "Broken", { time: undefined });
    expect(() => buildSpellDetails([copy("p/a", "1", "broken", broken)], compendium, {})).toThrow(
      /spell p\/a -> broken \("Broken"\) failed validation/,
    );
  });
});
