import { describe, expect, it, afterAll } from "vitest";
import { mkdtempSync, mkdirSync, readdirSync, writeFileSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { RunGit } from "../src/stages/fetch.js";
import { parseArgs, runCli, type CliDeps, type CliIo } from "../src/cli.js";

describe("parseArgs", () => {
  it("parses update without latest", () => {
    expect(parseArgs(["update"])).toEqual({ name: "update", latest: false });
  });

  it("parses update --latest", () => {
    expect(parseArgs(["update", "--latest"])).toEqual({
      name: "update",
      latest: true,
    });
  });

  it("parses status and verify", () => {
    expect(parseArgs(["status"])).toEqual({ name: "status" });
    expect(parseArgs(["verify"])).toEqual({ name: "verify" });
  });

  it("rejects an unknown command", () => {
    expect(() => parseArgs(["frobnicate"])).toThrow(/unknown command/i);
  });

  it("rejects no command", () => {
    expect(() => parseArgs([])).toThrow(/usage/i);
  });

  it("rejects the removed --pack flag on update", () => {
    expect(() => parseArgs(["update", "--pack", "kingmaker-bestiary"])).toThrow(
      /unknown flag/i,
    );
  });

  it("rejects any unrecognised flag on update", () => {
    expect(() => parseArgs(["update", "--bogus"])).toThrow(/unknown flag/i);
  });

  it("rejects extra arguments on status and verify", () => {
    expect(() => parseArgs(["status", "extra"])).toThrow(/unknown flag/i);
    expect(() => parseArgs(["verify", "--pack", "x"])).toThrow(/unknown flag/i);
  });
});

// --- runCli, with a temp filesystem and a recording (never-networked) git ---

const CONFIG_PATH = fileURLToPath(new URL("../pf2data.config.json", import.meta.url));

const tmpDirs: string[] = [];
function tmpDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tmpDirs.push(dir);
  return dir;
}

afterAll(() => {
  for (const dir of tmpDirs) rmSync(dir, { recursive: true, force: true });
});

function recordingGit(): { calls: string[][]; cwds: string[]; run: RunGit } {
  const calls: string[][] = [];
  const cwds: string[] = [];
  const run: RunGit = (args, cwd) => {
    calls.push(args);
    cwds.push(cwd);
    if (args[0] === "rev-parse") return "abc123def456\n";
    return "";
  };
  return { calls, cwds, run };
}

function silentIo(overrides: Partial<CliIo> = {}): CliIo {
  return { out: () => {}, err: () => {}, isTty: true, ...overrides };
}

/**
 * A REAL French checkout on disk -- `loadBabele` reads the directory itself,
 * so a hand-rolled table object would not exercise the loader at all. The
 * file names and `entries` shape are the module's own; the ids are the Stag
 * Lord's actual Foundry item ids, taken from the fixture.
 */
const STAG_LORD_ITEM_IDS = {
  longsword: "gj9hDQvaXekxyv1Q",
  bow: "qVOjbIdihxei6lTm",
  huntPrey: "H5KqV1tEsBEfhfvU",
};

function seedFrenchCache(
  entries: Record<string, unknown> | null = null,
  frLang: Record<string, unknown> = {},
): string {
  const frCacheDir = tmpDir("pf2data-fr-cache-");
  const babeleDir = join(frCacheDir, "babele", "vf", "fr");
  mkdirSync(babeleDir, { recursive: true });
  writeFileSync(
    join(babeleDir, "pf2e.kingmaker-bestiary.json"),
    JSON.stringify({
      entries: entries ?? {
        "The Stag Lord": {
          name: "Seigneur Cerf",
          description: "<p>Notes en fran\u00e7ais.</p>",
          items: {
            [STAG_LORD_ITEM_IDS.longsword]: { name: "\u00c9p\u00e9e longue" },
            [STAG_LORD_ITEM_IDS.bow]: { name: "Arc long composite" },
            [STAG_LORD_ITEM_IDS.huntPrey]: {
              name: "Chasser une proie",
              description: "<p>Description FR.</p>",
            },
          },
        },
      },
    }),
  );
  mkdirSync(join(frCacheDir, "lang"), { recursive: true });
  writeFileSync(join(frCacheDir, "lang", "fr.json"), JSON.stringify(frLang));
  // `loadArchive` reads this directory unconditionally -- Task 17. Empty is
  // fine (no pack subdirectories to walk); it just has to exist.
  mkdirSync(join(frCacheDir, "archive"), { recursive: true });
  return frCacheDir;
}

describe("runCli", () => {
  it("verify never refetches when no dataset has been generated", () => {
    const deps: CliDeps = {
      dataDir: tmpDir("pf2data-data-"),
      cacheDir: tmpDir("pf2data-cache-"),
      frCacheDir: seedFrenchCache(),
      configPath: CONFIG_PATH,
    };
    const { calls, run } = recordingGit();
    const exit = runCli(["verify"], silentIo(), { ...deps, runGit: run });
    expect(exit).toBe(20);
    expect(calls).toEqual([]);
  });

  it("splits TTY prose from stdout JSON", () => {
    const deps: CliDeps = {
      dataDir: tmpDir("pf2data-data-"),
      cacheDir: tmpDir("pf2data-cache-"),
      frCacheDir: seedFrenchCache(),
      configPath: CONFIG_PATH,
    };

    const outTty: string[] = [];
    const errTty: string[] = [];
    runCli(["status"], { out: (s) => outTty.push(s), err: (s) => errTty.push(s), isTty: true }, deps);
    expect(outTty).toEqual([]);
    expect(errTty.length).toBeGreaterThan(0);

    const outPipe: string[] = [];
    const errPipe: string[] = [];
    runCli(["status"], { out: (s) => outPipe.push(s), err: (s) => errPipe.push(s), isTty: false }, deps);
    expect(outPipe.length).toBe(1);
    expect(() => JSON.parse(outPipe[0]!)).not.toThrow();
    expect(errPipe.length).toBeGreaterThan(0);
  });

  it("rejects an unknown command with exit code 1", () => {
    const exit = runCli(["frobnicate"], silentIo());
    expect(exit).toBe(1);
  });

  it("update lifecycle: first run reports updated, second is unchanged, manifest is byte-identical", () => {
    const dataDir = tmpDir("pf2data-data-");
    const cacheDir = tmpDir("pf2data-cache-");
    const configDir = tmpDir("pf2data-config-");

    const configPath = join(configDir, "pf2data.config.json");
    writeFileSync(
      configPath,
      JSON.stringify({
        upstream: { repo: "https://example.invalid/pf2e", branch: "master" },
        french: { repo: "https://example.invalid/pf2e-fr", branch: "master" },
        packs: [{ name: "kingmaker-bestiary", kind: "creatures" }],
      }),
    );

    const packDir = join(cacheDir, "packs", "kingmaker-bestiary");
    mkdirSync(packDir, { recursive: true });
    const fixture = readFileSync(
      fileURLToPath(new URL("./fixtures/the-stag-lord.json", import.meta.url)),
      "utf8",
    );
    writeFileSync(join(packDir, "the-stag-lord.json"), fixture);

    // The reference stage (Task 18) always reads the upstream lang file. Real
    // sparse-checkouts always fetch it; this mocked-git test has to lay it
    // down itself. This config has no "conditions"-kind pack, so
    // buildConditions reads no directory and none needs to exist here.
    mkdirSync(join(cacheDir, "static", "lang"), { recursive: true });
    writeFileSync(join(cacheDir, "static", "lang", "en.json"), "{}");

    const { run } = recordingGit();
    const deps: CliDeps = { dataDir, cacheDir, frCacheDir: seedFrenchCache(), configPath, runGit: run };

    const exit1 = runCli(["update", "--latest"], silentIo(), deps);
    expect(exit1).toBe(10);
    const manifest1 = readFileSync(join(dataDir, "manifest.json"), "utf8");

    const exit2 = runCli(["update"], silentIo(), deps);
    expect(exit2).toBe(0);
    const manifest2 = readFileSync(join(dataDir, "manifest.json"), "utf8");

    expect(manifest2).toBe(manifest1);
  });

  it("reports a malformed actor as a structured failure instead of throwing, and writes nothing", () => {
    const dataDir = tmpDir("pf2data-data-");
    const cacheDir = tmpDir("pf2data-cache-");
    const configDir = tmpDir("pf2data-config-");

    const configPath = join(configDir, "pf2data.config.json");
    writeFileSync(
      configPath,
      JSON.stringify({
        upstream: { repo: "https://example.invalid/pf2e", branch: "master" },
        french: { repo: "https://example.invalid/pf2e-fr", branch: "master" },
        packs: [{ name: "kingmaker-bestiary", kind: "creatures" }],
      }),
    );

    const packDir = join(cacheDir, "packs", "kingmaker-bestiary");
    mkdirSync(packDir, { recursive: true });
    const fixture = JSON.parse(
      readFileSync(
        fileURLToPath(new URL("./fixtures/the-stag-lord.json", import.meta.url)),
        "utf8",
      ),
    );
    // Corrupt a required numeric field so normalizeCreature throws a ZodError.
    fixture.system.attributes.ac.value = "not-a-number";
    writeFileSync(
      join(packDir, "broken-creature.json"),
      JSON.stringify(fixture),
    );

    mkdirSync(join(cacheDir, "static", "lang"), { recursive: true });
    writeFileSync(join(cacheDir, "static", "lang", "en.json"), "{}");

    const { run } = recordingGit();
    const deps: CliDeps = { dataDir, cacheDir, frCacheDir: seedFrenchCache(), configPath, runGit: run };

    const errLines: string[] = [];
    const exit = runCli(
      ["update", "--latest"],
      { out: () => {}, err: (s) => errLines.push(s), isTty: true },
      deps,
    );

    expect(exit).toBe(20);
    expect(errLines.some((l) => l.includes("kingmaker-bestiary/broken-creature"))).toBe(true);
    expect(existsSync(join(dataDir, "manifest.json"))).toBe(false);
  });

  function seededDeps(): { deps: CliDeps; dataDir: string; cacheDir: string } {
    const dataDir = tmpDir("pf2data-data-");
    const cacheDir = tmpDir("pf2data-cache-");
    const configDir = tmpDir("pf2data-config-");

    const configPath = join(configDir, "pf2data.config.json");
    writeFileSync(
      configPath,
      JSON.stringify({
        upstream: { repo: "https://example.invalid/pf2e", branch: "master" },
        french: { repo: "https://example.invalid/pf2e-fr", branch: "master" },
        packs: [{ name: "kingmaker-bestiary", kind: "creatures" }],
      }),
    );

    const packDir = join(cacheDir, "packs", "kingmaker-bestiary");
    mkdirSync(packDir, { recursive: true });
    const fixture = readFileSync(
      fileURLToPath(new URL("./fixtures/the-stag-lord.json", import.meta.url)),
      "utf8",
    );
    writeFileSync(join(packDir, "the-stag-lord.json"), fixture);

    mkdirSync(join(cacheDir, "static", "lang"), { recursive: true });
    writeFileSync(join(cacheDir, "static", "lang", "en.json"), "{}");

    const { run } = recordingGit();
    const frCacheDir = seedFrenchCache();
    return { deps: { dataDir, cacheDir, frCacheDir, configPath, runGit: run }, dataDir, cacheDir, frCacheDir };
  }

  it("C3: a change confined to a non-creature emitted file yields exit 10, not 0", () => {
    const { deps, dataDir } = seededDeps();

    expect(runCli(["update", "--latest"], silentIo(), deps)).toBe(10);
    expect(runCli(["update"], silentIo(), deps)).toBe(0);

    // Mutate an on-disk index file so it no longer matches what a fresh
    // regeneration from the same pinned SHA would produce, while every
    // creature file is untouched. Before Task C3 this reported "unchanged"
    // and exited 0 even though `git diff data/` would be non-empty.
    const indexPath = join(dataDir, "index", "kingmaker-bestiary.json");
    const original = readFileSync(indexPath, "utf8");
    writeFileSync(indexPath, original.replace('"rarity"', '"driftedField"'));

    const exit = runCli(["update"], silentIo(), deps);
    expect(exit).toBe(10);

    // And the drifted content is corrected back to the regenerated form.
    expect(readFileSync(indexPath, "utf8")).toContain('"rarity"');
  });

  it("I6: a missing/renamed upstream pack directory is an upstream error (exit 30), not a crash", () => {
    const dataDir = tmpDir("pf2data-data-");
    const cacheDir = tmpDir("pf2data-cache-");
    const configDir = tmpDir("pf2data-config-");

    const configPath = join(configDir, "pf2data.config.json");
    writeFileSync(
      configPath,
      JSON.stringify({
        upstream: { repo: "https://example.invalid/pf2e", branch: "master" },
        french: { repo: "https://example.invalid/pf2e-fr", branch: "master" },
        packs: [{ name: "renamed-away-bestiary", kind: "creatures" }],
      }),
    );

    // Deliberately do NOT create packs/renamed-away-bestiary: this simulates
    // upstream renaming or removing the pack directory between pinned SHAs.
    mkdirSync(join(cacheDir, "static", "lang"), { recursive: true });
    writeFileSync(join(cacheDir, "static", "lang", "en.json"), "{}");

    const { run } = recordingGit();
    const deps: CliDeps = { dataDir, cacheDir, frCacheDir: seedFrenchCache(), configPath, runGit: run };

    const errLines: string[] = [];
    const exit = runCli(
      ["update", "--latest"],
      { out: () => {}, err: (s) => errLines.push(s), isTty: true },
      deps,
    );

    expect(exit).toBe(30);
    expect(errLines.some((l) => l.includes("upstream error"))).toBe(true);
    expect(existsSync(join(dataDir, "manifest.json"))).toBe(false);
  });

  it("I6: a corrupt manifest.json is a verification failure (exit 20), not a crash", () => {
    const { deps, dataDir } = seededDeps();
    mkdirSync(dataDir, { recursive: true });
    writeFileSync(join(dataDir, "manifest.json"), "{ not valid json");

    const errLines: string[] = [];
    const exit = runCli(
      ["status"],
      { out: () => {}, err: (s) => errLines.push(s), isTty: true },
      deps,
    );

    expect(exit).toBe(20);
    expect(errLines.some((l) => l.toLowerCase().includes("manifest"))).toBe(true);
  });

  it("I6: a corrupt on-disk dataset file fails verify with exit 20 instead of throwing", () => {
    const { deps, dataDir } = seededDeps();
    expect(runCli(["update", "--latest"], silentIo(), deps)).toBe(10);

    writeFileSync(join(dataDir, "books.json"), "{ not valid json");

    const errLines: string[] = [];
    const exit = runCli(
      ["verify"],
      { out: () => {}, err: (s) => errLines.push(s), isTty: true },
      deps,
    );

    expect(exit).toBe(20);
    expect(errLines.some((l) => l.toLowerCase().includes("corrupt"))).toBe(true);
  });

  describe("N2: verify catches a DELETED emitted file, not just a corrupt one", () => {
    const deletionCases: [string, (dataDir: string) => string][] = [
      ["books.json", (dataDir) => join(dataDir, "books.json")],
      ["conditions.json", (dataDir) => join(dataDir, "conditions.json")],
      ["glossary.json", (dataDir) => join(dataDir, "glossary.json")],
      ["traits.json", (dataDir) => join(dataDir, "traits.json")],
      ["SCHEMA.md", (dataDir) => join(dataDir, "SCHEMA.md")],
      ["index/kingmaker-bestiary.json", (dataDir) => join(dataDir, "index", "kingmaker-bestiary.json")],
    ];

    for (const [relPath, resolvePath] of deletionCases) {
      it(`fails verify with exit 20 and names the path when ${relPath} is deleted`, () => {
        const { deps, dataDir } = seededDeps();
        expect(runCli(["update", "--latest"], silentIo(), deps)).toBe(10);

        rmSync(resolvePath(dataDir), { force: true });

        const errLines: string[] = [];
        const exit = runCli(
          ["verify"],
          { out: () => {}, err: (s) => errLines.push(s), isTty: true },
          deps,
        );

        expect(exit).toBe(20);
        expect(errLines.some((l) => l.includes(relPath))).toBe(true);
      });
    }
  });

  it("N3: a manifest field change alone (toolVersion), with every emitted file byte-identical, yields exit 10 not 0", () => {
    const { deps, dataDir } = seededDeps();
    expect(runCli(["update", "--latest"], silentIo(), deps)).toBe(10);
    expect(runCli(["update"], silentIo(), deps)).toBe(0);

    const manifestPath = join(dataDir, "manifest.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    manifest.toolVersion = "0.0.1-drifted";
    writeFileSync(manifestPath, JSON.stringify(manifest));

    const exit = runCli(["update"], silentIo(), deps);
    expect(exit).toBe(10);

    // and the drifted field is corrected back to what the tool actually emits
    const fixed = JSON.parse(readFileSync(manifestPath, "utf8"));
    expect(fixed.toolVersion).not.toBe("0.0.1-drifted");
  });

  // --- Task 7: the French overlay is REACHABLE from `update` ------------
  //
  // Everything below exists because six pieces of this feature had zero call
  // sites until this task. These assertions are the ones that fail if the
  // wiring is ever removed, however green the unit tests stay.

  it("update writes the per-creature French overlay, the index overlay and the reference overlays", () => {
    const { deps, dataDir } = seededDeps();
    expect(runCli(["update", "--latest"], silentIo(), deps)).toBe(10);

    const overlay = JSON.parse(
      readFileSync(
        join(dataDir, "i18n", "fr", "creatures", "kingmaker-bestiary", "the-stag-lord.json"),
        "utf8",
      ),
    );
    expect(overlay.name).toBe("Seigneur Cerf");
    expect(overlay.publicNotes).toBe("<p>Notes en français.</p>");

    // Aligned by position, and each position carries the English name it was
    // built from so `verifyI18n` can check the alignment later.
    const bow = overlay.attacks.find((a: { en: string }) => a.en === "Composite Longbow");
    expect(bow.name).toBe("Arc long composite");
    const untranslatedAttack = overlay.attacks.find(
      (a: { en: string }) => a.en !== "Composite Longbow" && a.en !== "Longsword",
    );
    expect(untranslatedAttack).toBeUndefined();
    const huntPrey = overlay.actions.find((a: { en: string }) => a.en === "Hunt Prey");
    expect(huntPrey.name).toBe("Chasser une proie");
    // An action Babele has no entry for is null, never the English text.
    const sneak = overlay.actions.find((a: { en: string }) => a.en === "Sneak Attack");
    expect(sneak.name).toBeNull();
    expect(sneak.description).toBeNull();

    const index = JSON.parse(
      readFileSync(join(dataDir, "i18n", "fr", "index", "kingmaker-bestiary.json"), "utf8"),
    );
    expect(index["kingmaker-bestiary/the-stag-lord"]).toBe("Seigneur Cerf");

    for (const file of ["conditions.json", "glossary.json", "traits.json"]) {
      expect(existsSync(join(dataDir, "i18n", "fr", file))).toBe(true);
    }
  });

  it("update pins frRef and frRepo in the manifest", () => {
    const { deps, dataDir } = seededDeps();
    expect(runCli(["update", "--latest"], silentIo(), deps)).toBe(10);
    const manifest = JSON.parse(readFileSync(join(dataDir, "manifest.json"), "utf8"));
    expect(manifest.frRef).toBe("abc123def456");
    expect(manifest.frRepo).toBe("https://example.invalid/pf2e-fr");
  });

  it("fetches the French module into its OWN cache dir, never the English one", () => {
    // Both stages drive `git sparse-checkout set`; sharing a directory would
    // have each upstream overwrite the other's cone. Nothing enforces this
    // but the call site, so the call site is what gets tested.
    const { deps, cacheDir, frCacheDir } = seededDeps();
    const { cwds, run } = recordingGit();
    expect(runCli(["update", "--latest"], silentIo(), { ...deps, runGit: run })).toBe(10);
    expect(cacheDir).not.toBe(frCacheDir);
    expect(cwds).toContain(cacheDir);
    expect(cwds).toContain(frCacheDir);
  });

  it("writes no overlay for an untranslated creature and names it in the report", () => {
    const { deps, dataDir, cacheDir } = seededDeps();

    // A second creature the Babele table has no entry for -- 30 real ones
    // are in this state.
    const fixture = JSON.parse(
      readFileSync(
        fileURLToPath(new URL("./fixtures/the-stag-lord.json", import.meta.url)),
        "utf8",
      ),
    );
    fixture.name = "Manticore";
    fixture._id = "manticoremanticor";
    writeFileSync(
      join(cacheDir, "packs", "kingmaker-bestiary", "manticore.json"),
      JSON.stringify(fixture),
    );

    const errLines: string[] = [];
    const outLines: string[] = [];
    expect(
      runCli(
        ["update", "--latest"],
        { out: (x) => outLines.push(x), err: (x) => errLines.push(x), isTty: false },
        deps,
      ),
    ).toBe(10);

    expect(
      existsSync(join(dataDir, "i18n", "fr", "creatures", "kingmaker-bestiary", "manticore.json")),
    ).toBe(false);
    // ...and the index overlay omits it rather than echoing "Manticore".
    const index = JSON.parse(
      readFileSync(join(dataDir, "i18n", "fr", "index", "kingmaker-bestiary.json"), "utf8"),
    );
    expect(index).not.toHaveProperty("kingmaker-bestiary/manticore");

    const french = JSON.parse(outLines.join("")).french;
    expect(french).toEqual({
      translated: 1,
      total: 2,
      untranslated: ["kingmaker-bestiary/manticore"],
    });
    expect(errLines.join("")).toContain("kingmaker-bestiary/manticore");
  });

  it("deletes an overlay file it no longer produces", () => {
    // A creature that loses its Babele entry must lose its overlay file too,
    // not keep serving a translation the source no longer has.
    const { deps, dataDir } = seededDeps();
    expect(runCli(["update", "--latest"], silentIo(), deps)).toBe(10);

    const stale = join(dataDir, "i18n", "fr", "creatures", "kingmaker-bestiary", "gone.json");
    writeFileSync(stale, "{}\n");

    expect(runCli(["update"], silentIo(), deps)).toBe(10);
    expect(existsSync(stale)).toBe(false);
  });

  it("a French overlay drift alone yields exit 10, not 0", () => {
    const { deps, dataDir } = seededDeps();
    expect(runCli(["update", "--latest"], silentIo(), deps)).toBe(10);
    expect(runCli(["update"], silentIo(), deps)).toBe(0);

    const overlayPath = join(
      dataDir, "i18n", "fr", "creatures", "kingmaker-bestiary", "the-stag-lord.json",
    );
    writeFileSync(overlayPath, readFileSync(overlayPath, "utf8").replace("Seigneur Cerf", "drifted"));

    expect(runCli(["update"], silentIo(), deps)).toBe(10);
    expect(readFileSync(overlayPath, "utf8")).toContain("Seigneur Cerf");
  });

  it("an unpinned frRef is an upstream error that names frRef, not upstreamRef", () => {
    const { deps, dataDir } = seededDeps();
    expect(runCli(["update", "--latest"], silentIo(), deps)).toBe(10);

    const manifestPath = join(dataDir, "manifest.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    manifest.frRef = "";
    writeFileSync(manifestPath, JSON.stringify(manifest));

    const errLines: string[] = [];
    const exit = runCli(
      ["update"],
      { out: () => {}, err: (x) => errLines.push(x), isTty: true },
      deps,
    );

    expect(exit).toBe(30);
    expect(errLines.join("")).toContain("frRef");
    expect(errLines.join("")).not.toContain("upstreamRef");
  });

  it("verify fails when a committed overlay position no longer names the action it translates", () => {
    // The overlay is keyed by array POSITION. If the creature file and the
    // overlay drift apart, position 0 of the overlay starts translating
    // something else -- a mistranslated Strike, with every schema still
    // valid. This is the check that makes that loud.
    const { deps, dataDir } = seededDeps();
    expect(runCli(["update", "--latest"], silentIo(), deps)).toBe(10);
    expect(runCli(["verify"], silentIo(), deps)).toBe(0);

    const overlayPath = join(
      dataDir, "i18n", "fr", "creatures", "kingmaker-bestiary", "the-stag-lord.json",
    );
    const overlay = JSON.parse(readFileSync(overlayPath, "utf8"));
    overlay.attacks[0].en = "Trident";
    writeFileSync(overlayPath, JSON.stringify(overlay));

    const errLines: string[] = [];
    const exit = runCli(
      ["verify"],
      { out: () => {}, err: (x) => errLines.push(x), isTty: true },
      deps,
    );

    expect(exit).toBe(20);
    expect(errLines.join("")).toContain("kingmaker-bestiary/the-stag-lord");
    expect(errLines.join("")).toContain("Trident");
  });

  it("verify fails when a committed overlay has fewer positions than the creature", () => {
    const { deps, dataDir } = seededDeps();
    expect(runCli(["update", "--latest"], silentIo(), deps)).toBe(10);

    const overlayPath = join(
      dataDir, "i18n", "fr", "creatures", "kingmaker-bestiary", "the-stag-lord.json",
    );
    const overlay = JSON.parse(readFileSync(overlayPath, "utf8"));
    overlay.actions.pop();
    writeFileSync(overlayPath, JSON.stringify(overlay));

    expect(runCli(["verify"], silentIo(), deps)).toBe(20);
  });

  it("verify still passes for a creature that legitimately has no overlay", () => {
    const { deps, dataDir } = seededDeps();
    expect(runCli(["update", "--latest"], silentIo(), deps)).toBe(10);
    rmSync(
      join(dataDir, "i18n", "fr", "creatures", "kingmaker-bestiary", "the-stag-lord.json"),
      { force: true },
    );
    expect(runCli(["verify"], silentIo(), deps)).toBe(0);
  });

  // Re-review of the fix above: the expected set it built (`referenceFiles`)
  // was `readdirSync(indexDir)` -- enumerating what's PRESENT, so a file
  // absent from the very directory being enumerated could never be reported
  // missing. Proven live against the real 1450-creature dataset too (one
  // pack's index.json removed while the other four stay -- only that one is
  // reported, the other four still verify clean), but this fixture only
  // configures one creature pack, so here "one pack's index is missing" and
  // "every pack's index is missing" are the same file. The expected set is
  // now `manifest.packs` filtered by `config.packs`' creature kind --
  // independent of what's actually present on disk -- so a single missing
  // pack index is caught without needing the whole directory gone too.
  it("verify fails when a pack's own French index file is missing, directory otherwise intact", () => {
    const { deps, dataDir } = seededDeps();
    expect(runCli(["update", "--latest"], silentIo(), deps)).toBe(10);
    rmSync(join(dataDir, "i18n", "fr", "index", "kingmaker-bestiary.json"), { force: true });
    // The directory itself is untouched -- only the one file inside it is
    // gone -- which is exactly what a `readdirSync`-based scan can't see.
    expect(existsSync(join(dataDir, "i18n", "fr", "index"))).toBe(true);

    const errLines: string[] = [];
    const exit = runCli(
      ["verify"],
      { out: () => {}, err: (x) => errLines.push(x), isTty: true },
      deps,
    );

    expect(exit).toBe(20);
    expect(errLines.join("")).toContain("i18n/fr/index/kingmaker-bestiary.json");
  });

  // The other half of the same structural bug: a per-creature overlay is
  // legitimately allowed to be missing (see the test above), but that
  // exception must not swallow the case where EVERY creature in a pack is
  // missing its overlay because the whole `i18n/fr/creatures/<pack>/`
  // subdirectory is gone -- proven live against the real dataset too
  // (`rm -rf data/i18n/fr/creatures/` reports all five pack subdirectories
  // missing, restore leaves `git status --porcelain` empty and
  // `verify` `ok: true` again).
  it("verify fails when a pack's whole i18n/fr/creatures/<pack>/ subdirectory is missing, not just one file in it", () => {
    const { deps, dataDir } = seededDeps();
    expect(runCli(["update", "--latest"], silentIo(), deps)).toBe(10);
    rmSync(join(dataDir, "i18n", "fr", "creatures", "kingmaker-bestiary"), {
      recursive: true,
      force: true,
    });

    const errLines: string[] = [];
    const exit = runCli(
      ["verify"],
      { out: () => {}, err: (x) => errLines.push(x), isTty: true },
      deps,
    );

    expect(exit).toBe(20);
    expect(errLines.join("")).toContain("i18n/fr/creatures/kingmaker-bestiary/");
  });

  // Unlike a per-creature overlay, `index/`, `conditions.json`,
  // `glossary.json` and `traits.json` have no legitimate absent state in a
  // checked-in dataset -- a wholesale loss of the French index (or of one
  // of the three reference files) must fail loud, not fall back to English
  // everywhere silently.
  it("verify fails when the whole i18n/fr/index/ directory is missing", () => {
    const { deps, dataDir } = seededDeps();
    expect(runCli(["update", "--latest"], silentIo(), deps)).toBe(10);
    rmSync(join(dataDir, "i18n", "fr", "index"), { recursive: true, force: true });

    const errLines: string[] = [];
    const exit = runCli(
      ["verify"],
      { out: () => {}, err: (x) => errLines.push(x), isTty: true },
      deps,
    );

    expect(exit).toBe(20);
    expect(errLines.join("")).toContain("i18n/fr/index/");
  });

  it.each(["conditions.json", "glossary.json", "traits.json"])(
    "verify fails when %s is missing",
    (file) => {
      const { deps, dataDir } = seededDeps();
      expect(runCli(["update", "--latest"], silentIo(), deps)).toBe(10);
      rmSync(join(dataDir, "i18n", "fr", file), { force: true });

      const errLines: string[] = [];
      const exit = runCli(
        ["verify"],
        { out: () => {}, err: (x) => errLines.push(x), isTty: true },
        deps,
      );

      expect(exit).toBe(20);
      expect(errLines.join("")).toContain(`i18n/fr/${file}`);
    },
  );

  // --- Task 7 fix round 1: Babele text is RAW Foundry markup -------------

  it("resolves @Localize and @UUID out of the generated French text, using the FRENCH lang table", () => {
    const dataDir = tmpDir("pf2data-data-");
    const cacheDir = tmpDir("pf2data-cache-");
    const configDir = tmpDir("pf2data-config-");

    const configPath = join(configDir, "pf2data.config.json");
    writeFileSync(
      configPath,
      JSON.stringify({
        upstream: { repo: "https://example.invalid/pf2e", branch: "master" },
        french: { repo: "https://example.invalid/pf2e-fr", branch: "master" },
        packs: [{ name: "kingmaker-bestiary", kind: "creatures" }],
      }),
    );

    const packDir = join(cacheDir, "packs", "kingmaker-bestiary");
    mkdirSync(packDir, { recursive: true });
    writeFileSync(
      join(packDir, "the-stag-lord.json"),
      readFileSync(
        fileURLToPath(new URL("./fixtures/the-stag-lord.json", import.meta.url)),
        "utf8",
      ),
    );

    // The SAME glossary key in both lang files. Resolving against the English
    // one would put English prose inside French text -- worse than leaving the
    // marker, because it looks correct.
    mkdirSync(join(cacheDir, "static", "lang"), { recursive: true });
    writeFileSync(
      join(cacheDir, "static", "lang", "en.json"),
      JSON.stringify({ PF2E: { Glossary: { Trap: "<p>ENGLISH glossary text.</p>" } } }),
    );

    const frCacheDir = seedFrenchCache(
      {
        "The Stag Lord": {
          name: "Seigneur Cerf",
          description: "<p>Voir @UUID[Compendium.pf2e.actionspf2e.Item.BlAOM2X92SI6HMtJ]{Cherchez}.</p>",
          items: {
            [STAG_LORD_ITEM_IDS.huntPrey]: {
              name: "Chasser une proie",
              description: "@Localize[PF2E.Glossary.Trap]",
            },
          },
        },
      },
      { PF2E: { Glossary: { Trap: "<p>Texte FRANÇAIS du glossaire.</p>" } } },
    );

    const { run } = recordingGit();
    const deps: CliDeps = { dataDir, cacheDir, frCacheDir, configPath, runGit: run };
    expect(runCli(["update", "--latest"], silentIo(), deps)).toBe(10);

    const overlay = readFileSync(
      join(dataDir, "i18n", "fr", "creatures", "kingmaker-bestiary", "the-stag-lord.json"),
      "utf8",
    );
    expect(overlay).not.toContain("@UUID[");
    expect(overlay).not.toContain("@Localize[");
    // The @UUID collapses to its FRENCH label, not to a bare id.
    expect(overlay).toContain("Voir Cherchez.");
    expect(overlay).toContain("Texte FRANÇAIS du glossaire.");
    expect(overlay).not.toContain("ENGLISH glossary text");
  });

  it("no generated French file carries an @UUID or @Localize marker", () => {
    const { deps, dataDir } = seededDeps();
    expect(runCli(["update", "--latest"], silentIo(), deps)).toBe(10);

    const root = join(dataDir, "i18n");
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
      );
    const files = walk(root);
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      expect(text).not.toContain("@UUID[");
      expect(text).not.toContain("@Localize[");
    }
  });

  it("verify fails when a committed overlay still carries an unresolved marker", () => {
    const { deps, dataDir } = seededDeps();
    expect(runCli(["update", "--latest"], silentIo(), deps)).toBe(10);

    const overlayPath = join(
      dataDir, "i18n", "fr", "creatures", "kingmaker-bestiary", "the-stag-lord.json",
    );
    const overlay = JSON.parse(readFileSync(overlayPath, "utf8"));
    overlay.publicNotes = "<p>@UUID[Compendium.pf2e.actionspf2e.Item.X]{Cherchez}</p>";
    writeFileSync(overlayPath, JSON.stringify(overlay));

    const errLines: string[] = [];
    expect(
      runCli(["verify"], { out: () => {}, err: (x) => errLines.push(x), isTty: true }, deps),
    ).toBe(20);
    expect(errLines.join("")).toContain("@UUID");
  });

  it("verify fails when a committed reference overlay carries an unresolved marker", () => {
    const { deps, dataDir } = seededDeps();
    expect(runCli(["update", "--latest"], silentIo(), deps)).toBe(10);

    writeFileSync(
      join(dataDir, "i18n", "fr", "glossary.json"),
      JSON.stringify({ grab: { name: "Agrippement", description: "@Localize[PF2E.X]" } }),
    );

    const errLines: string[] = [];
    expect(
      runCli(["verify"], { out: () => {}, err: (x) => errLines.push(x), isTty: true }, deps),
    ).toBe(20);
    expect(errLines.join("")).toContain("glossary.json");
  });

  // --- Task 7 fix round 2 -------------------------------------------------
  //
  // Each of the three builders takes a lang table, and each is a separate call
  // site that can be handed the WRONG one with every unit test still green.
  // Resolving French text against the English table succeeds, so the markup
  // guard cannot see it either: the only symptom is English prose inside
  // otherwise-French output. One test per call site.

  /**
   * A full pipeline fixture: creatures, conditions and glossary packs
   * upstream, matching Babele files in the French checkout, and ONE
   * `@Localize` key that exists in both lang tables with different prose.
   * Whichever table a call site passes is therefore visible in the output.
   */
  function bilingualDeps(): { deps: CliDeps; dataDir: string } {
    const dataDir = tmpDir("pf2data-data-");
    const cacheDir = tmpDir("pf2data-cache-");
    const configDir = tmpDir("pf2data-config-");

    const configPath = join(configDir, "pf2data.config.json");
    writeFileSync(
      configPath,
      JSON.stringify({
        upstream: { repo: "https://example.invalid/pf2e", branch: "master" },
        french: { repo: "https://example.invalid/pf2e-fr", branch: "master" },
        packs: [
          { name: "kingmaker-bestiary", kind: "creatures" },
          { name: "conditions", kind: "conditions" },
          { name: "bestiary-ability-glossary-srd", kind: "glossary" },
        ],
      }),
    );

    const packDir = join(cacheDir, "packs", "kingmaker-bestiary");
    mkdirSync(packDir, { recursive: true });
    writeFileSync(
      join(packDir, "the-stag-lord.json"),
      readFileSync(
        fileURLToPath(new URL("./fixtures/the-stag-lord.json", import.meta.url)),
        "utf8",
      ),
    );

    const conditionsDir = join(cacheDir, "packs", "conditions");
    mkdirSync(conditionsDir, { recursive: true });
    writeFileSync(
      join(conditionsDir, "frightened.json"),
      JSON.stringify({
        name: "Frightened",
        type: "condition",
        system: { description: { value: "<p>en</p>" }, value: { isValued: true } },
      }),
    );

    const glossaryDir = join(cacheDir, "packs", "bestiary-ability-glossary-srd");
    mkdirSync(glossaryDir, { recursive: true });
    writeFileSync(
      join(glossaryDir, "grab.json"),
      JSON.stringify({
        name: "Grab",
        type: "action",
        system: {
          actionType: { value: "action" },
          actions: { value: 1 },
          description: { value: "<p>en</p>" },
        },
      }),
    );

    mkdirSync(join(cacheDir, "static", "lang"), { recursive: true });
    writeFileSync(
      join(cacheDir, "static", "lang", "en.json"),
      JSON.stringify({ PF2E: { Shared: { Key: "<p>ENGLISH PROSE</p>" } } }),
    );

    const frCacheDir = tmpDir("pf2data-fr-cache-");
    const babeleDir = join(frCacheDir, "babele", "vf", "fr");
    mkdirSync(babeleDir, { recursive: true });
    const localized = "@Localize[PF2E.Shared.Key]";
    writeFileSync(
      join(babeleDir, "pf2e.kingmaker-bestiary.json"),
      JSON.stringify({
        entries: {
          "The Stag Lord": {
            name: "Seigneur Cerf",
            items: { [STAG_LORD_ITEM_IDS.huntPrey]: { name: "Chasser une proie", description: localized } },
          },
        },
      }),
    );
    writeFileSync(
      join(babeleDir, "pf2e.conditionitems.json"),
      JSON.stringify({ entries: { Frightened: { name: "Effrayé", description: localized } } }),
    );
    writeFileSync(
      join(babeleDir, "pf2e.bestiary-ability-glossary-srd.json"),
      JSON.stringify({ entries: { Grab: { name: "Agrippement", description: localized } } }),
    );
    mkdirSync(join(frCacheDir, "lang"), { recursive: true });
    writeFileSync(
      join(frCacheDir, "lang", "fr.json"),
      JSON.stringify({ PF2E: { Shared: { Key: "<p>PROSE FRANÇAISE</p>" } } }),
    );
    // `loadArchive` reads this directory unconditionally -- Task 17.
    mkdirSync(join(frCacheDir, "archive"), { recursive: true });

    const { run } = recordingGit();
    return { deps: { dataDir, cacheDir, frCacheDir, configPath, runGit: run }, dataDir };
  }

  const readFr = (dataDir: string, ...parts: string[]): string =>
    readFileSync(join(dataDir, "i18n", "fr", ...parts), "utf8");

  it("buildCreatureI18n is handed the FRENCH lang table, not the English one", () => {
    const { deps, dataDir } = bilingualDeps();
    expect(runCli(["update", "--latest"], silentIo(), deps)).toBe(10);
    const overlay = readFr(dataDir, "creatures", "kingmaker-bestiary", "the-stag-lord.json");
    expect(overlay).toContain("PROSE FRANÇAISE");
    expect(overlay).not.toContain("ENGLISH PROSE");
  });

  it("buildConditionsI18n is handed the FRENCH lang table, not the English one", () => {
    const { deps, dataDir } = bilingualDeps();
    expect(runCli(["update", "--latest"], silentIo(), deps)).toBe(10);
    const conditions = readFr(dataDir, "conditions.json");
    // The fixture really does exercise the join, not an empty overlay.
    expect(conditions).toContain("Effrayé");
    expect(conditions).toContain("PROSE FRANÇAISE");
    expect(conditions).not.toContain("ENGLISH PROSE");
  });

  it("buildGlossaryI18n is handed the FRENCH lang table, not the English one", () => {
    const { deps, dataDir } = bilingualDeps();
    expect(runCli(["update", "--latest"], silentIo(), deps)).toBe(10);
    const glossary = readFr(dataDir, "glossary.json");
    expect(glossary).toContain("Agrippement");
    expect(glossary).toContain("PROSE FRANÇAISE");
    expect(glossary).not.toContain("ENGLISH PROSE");
  });

  it("update REFUSES to write when a creature overlay keeps an unresolvable marker", () => {
    // The markup guard runs before any write. Without that call site a marker
    // confined to creature overlays ships silently, exit 10, "updated".
    const dataDir = tmpDir("pf2data-data-");
    const cacheDir = tmpDir("pf2data-cache-");
    const configDir = tmpDir("pf2data-config-");

    const configPath = join(configDir, "pf2data.config.json");
    writeFileSync(
      configPath,
      JSON.stringify({
        upstream: { repo: "https://example.invalid/pf2e", branch: "master" },
        french: { repo: "https://example.invalid/pf2e-fr", branch: "master" },
        packs: [{ name: "kingmaker-bestiary", kind: "creatures" }],
      }),
    );
    const packDir = join(cacheDir, "packs", "kingmaker-bestiary");
    mkdirSync(packDir, { recursive: true });
    writeFileSync(
      join(packDir, "the-stag-lord.json"),
      readFileSync(
        fileURLToPath(new URL("./fixtures/the-stag-lord.json", import.meta.url)),
        "utf8",
      ),
    );
    mkdirSync(join(cacheDir, "static", "lang"), { recursive: true });
    writeFileSync(join(cacheDir, "static", "lang", "en.json"), "{}");

    // `PF2E.Nowhere.At.All` is in neither lang table, so the marker survives
    // both passes -- exactly what a future upstream key rename looks like.
    const frCacheDir = seedFrenchCache({
      "The Stag Lord": {
        name: "Seigneur Cerf",
        items: {
          [STAG_LORD_ITEM_IDS.huntPrey]: {
            name: "Chasser une proie",
            description: "@Localize[PF2E.Nowhere.At.All]",
          },
        },
      },
    });

    const { run } = recordingGit();
    const errLines: string[] = [];
    const exit = runCli(
      ["update", "--latest"],
      { out: () => {}, err: (x) => errLines.push(x), isTty: true },
      { dataDir, cacheDir, frCacheDir, configPath, runGit: run },
    );

    expect(exit).toBe(20);
    expect(errLines.join("")).toContain("@Localize");
    expect(errLines.join("")).toContain("kingmaker-bestiary/the-stag-lord");
    // ...and nothing at all was written.
    expect(existsSync(join(dataDir, "manifest.json"))).toBe(false);
    expect(existsSync(join(dataDir, "i18n"))).toBe(false);
    expect(existsSync(join(dataDir, "creatures"))).toBe(false);
  });

  it("update REFUSES to write when the INDEX overlay keeps a marker", () => {
    // 1420 Babele name strings, unguarded until now.
    const { deps, dataDir } = seededDeps();
    const frDeps = {
      ...deps,
      frCacheDir: seedFrenchCache({
        "The Stag Lord": { name: "Seigneur @Frobnicate[x]{Cerf}" },
      }),
    };

    const errLines: string[] = [];
    const exit = runCli(
      ["update", "--latest"],
      { out: () => {}, err: (x) => errLines.push(x), isTty: true },
      frDeps,
    );

    expect(exit).toBe(20);
    expect(errLines.join("")).toContain("index/kingmaker-bestiary.json");
    expect(existsSync(join(dataDir, "i18n"))).toBe(false);
  });

  it("verify fails when a committed INDEX overlay carries a marker", () => {
    const { deps, dataDir } = seededDeps();
    expect(runCli(["update", "--latest"], silentIo(), deps)).toBe(10);

    writeFileSync(
      join(dataDir, "i18n", "fr", "index", "kingmaker-bestiary.json"),
      JSON.stringify({ "kingmaker-bestiary/the-stag-lord": "Seigneur @Frobnicate[x]{Cerf}" }),
    );

    const errLines: string[] = [];
    expect(
      runCli(["verify"], { out: () => {}, err: (x) => errLines.push(x), isTty: true }, deps),
    ).toBe(20);
    expect(errLines.join("")).toContain("index/kingmaker-bestiary.json");
  });

  // --- Task 17: retired-module archive fallback ---------------------------

  it("fills BOTH the creature overlay and the index overlay from the archive when Babele has no entry", () => {
    const { deps, dataDir } = seededDeps();

    // Babele has nothing at all for this run (`seedFrenchCache({})`), so
    // every field below can only have come from the archive fallback.
    const frDeps = { ...deps, frCacheDir: seedFrenchCache({}) };
    const archivePackDir = join(frDeps.frCacheDir, "archive", "kingmaker-bestiary");
    mkdirSync(archivePackDir, { recursive: true });
    // "defXhBIK4TtoZXGK" is the-stag-lord.json fixture's own `_id`, the
    // join key `buildCreatureI18n` uses via `creature.foundryId`.
    writeFileSync(
      join(archivePackDir, "defXhBIK4TtoZXGK.htm"),
      "Name: The Stag Lord\n" +
        "Nom: Seigneur Cerf (archive)\n" +
        "État: officielle\n\n" +
        "-- Desc (en) --\n<p>EN notes.</p>\n" +
        "-- Desc (fr) --\n<p>Notes FR (archive).</p>\n-- End desc ---\n",
    );

    expect(runCli(["update", "--latest"], silentIo(), frDeps)).toBe(10);

    const overlay = JSON.parse(
      readFileSync(
        join(dataDir, "i18n", "fr", "creatures", "kingmaker-bestiary", "the-stag-lord.json"),
        "utf8",
      ),
    );
    expect(overlay.name).toBe("Seigneur Cerf (archive)");
    expect(overlay.publicNotes).toBe("<p>Notes FR (archive).</p>");

    const index = JSON.parse(
      readFileSync(join(dataDir, "i18n", "fr", "index", "kingmaker-bestiary.json"), "utf8"),
    );
    expect(index["kingmaker-bestiary/the-stag-lord"]).toBe("Seigneur Cerf (archive)");
  });

  it("never lets the archive shadow a live Babele translation, end to end", () => {
    const { deps, dataDir } = seededDeps();

    const frDeps = {
      ...deps,
      frCacheDir: seedFrenchCache({
        "The Stag Lord": { name: "Seigneur Cerf (Babele)" },
      }),
    };
    const archivePackDir = join(frDeps.frCacheDir, "archive", "kingmaker-bestiary");
    mkdirSync(archivePackDir, { recursive: true });
    writeFileSync(
      join(archivePackDir, "defXhBIK4TtoZXGK.htm"),
      "Name: The Stag Lord\nNom: WRONG (archive must not win)\n",
    );

    expect(runCli(["update", "--latest"], silentIo(), frDeps)).toBe(10);

    const overlay = JSON.parse(
      readFileSync(
        join(dataDir, "i18n", "fr", "creatures", "kingmaker-bestiary", "the-stag-lord.json"),
        "utf8",
      ),
    );
    expect(overlay.name).toBe("Seigneur Cerf (Babele)");
  });
});
