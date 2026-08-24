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
});
