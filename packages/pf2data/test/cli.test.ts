import { describe, expect, it, afterAll } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from "node:fs";
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

function recordingGit(): { calls: string[][]; run: RunGit } {
  const calls: string[][] = [];
  const run: RunGit = (args) => {
    calls.push(args);
    if (args[0] === "rev-parse") return "abc123def456\n";
    return "";
  };
  return { calls, run };
}

function silentIo(overrides: Partial<CliIo> = {}): CliIo {
  return { out: () => {}, err: () => {}, isTty: true, ...overrides };
}

describe("runCli", () => {
  it("verify never refetches when no dataset has been generated", () => {
    const deps: CliDeps = {
      dataDir: tmpDir("pf2data-data-"),
      cacheDir: tmpDir("pf2data-cache-"),
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
    const deps: CliDeps = { dataDir, cacheDir, configPath, runGit: run };

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
    const deps: CliDeps = { dataDir, cacheDir, configPath, runGit: run };

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
    return { deps: { dataDir, cacheDir, configPath, runGit: run }, dataDir, cacheDir };
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
    const deps: CliDeps = { dataDir, cacheDir, configPath, runGit: run };

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
});
