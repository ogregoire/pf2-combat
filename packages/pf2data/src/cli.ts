#!/usr/bin/env -S npx tsx
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { ManifestSchema, type IndexEntry, type Manifest } from "@pf2/schema";
import { loadConfig } from "./config.js";
import { writeJson, stableStringify } from "./io/write.js";
import { fetchUpstream, type RunGit } from "./stages/fetch.js";
import { normalizePacks } from "./stages/normalize.js";
import { buildIndexes } from "./stages/index.js";
import { verifyDataset } from "./stages/verify.js";
import { diffDataset, statusOf, type ChangeStatus } from "./report.js";
import { loadGlossaryLang } from "./normalize/localize.js";
import { buildConditions, buildGlossary, buildTraits } from "./stages/reference.js";
import { renderSchemaDoc } from "./docs/schema-doc.js";

export const EXIT = {
  unchanged: 0,
  updated: 10,
  verifyFailed: 20,
  upstreamError: 30,
  usageError: 1,
} as const;

export type Command =
  | { name: "update"; latest: boolean }
  | { name: "status" }
  | { name: "verify" };

const USAGE = "usage: pf2data <update [--latest] | status | verify>";

export function parseArgs(argv: string[]): Command {
  const [command, ...rest] = argv;
  if (command === undefined) throw new Error(USAGE);

  if (command === "update") {
    const unknown = rest.find((a) => a !== "--latest");
    if (unknown !== undefined) {
      throw new Error(`unknown flag "${unknown}". ${USAGE}`);
    }
    return { name: "update", latest: rest.includes("--latest") };
  }

  if (command === "status" || command === "verify") {
    if (rest.length > 0) {
      throw new Error(`unknown flag "${rest[0]}". ${USAGE}`);
    }
    return command === "status" ? { name: "status" } : { name: "verify" };
  }

  throw new Error(`unknown command "${command}". ${USAGE}`);
}

export interface CliIo {
  out: (s: string) => void;
  err: (s: string) => void;
  isTty: boolean;
}

export interface CliDeps {
  dataDir: string;
  cacheDir: string;
  configPath: string;
  runGit?: RunGit; // forwarded to fetchUpstream; undefined means the real git CLI
}

const ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const TOOL_VERSION = "0.1.0";

const DEFAULT_DEPS: CliDeps = {
  dataDir: join(ROOT, "data"),
  cacheDir: join(ROOT, ".cache", "pf2e"),
  configPath: join(ROOT, "packages/pf2data/pf2data.config.json"),
};

/** A corrupt on-disk manifest is a verification failure (exit 20), not an
 * uncaught crash: JSON.parse and ManifestSchema.parse both throw on bad
 * input. */
function readManifest(manifestPath: string): Manifest | null {
  if (!existsSync(manifestPath)) return null;
  return ManifestSchema.parse(JSON.parse(readFileSync(manifestPath, "utf8")));
}

interface OnDiskDataset {
  creatures: unknown[];
  books: unknown[];
  indexes: Record<string, unknown[]>;
  conditions: unknown[];
  glossary: unknown[];
  traits: unknown[];
}

/** Reads the committed dataset for `verify`. A corrupt file (bad JSON) is
 * left to throw; the caller treats that as a verification failure. */
function readDataset(manifest: Manifest | null, dataDir: string): OnDiskDataset {
  const empty: OnDiskDataset = {
    creatures: [],
    books: [],
    indexes: {},
    conditions: [],
    glossary: [],
    traits: [],
  };
  if (manifest === null) return empty;

  const readJson = (relPath: string, fallback: unknown): unknown => {
    const abs = join(dataDir, relPath);
    return existsSync(abs) ? JSON.parse(readFileSync(abs, "utf8")) : fallback;
  };

  const books = readJson("books.json", []) as unknown[];
  const conditions = readJson("conditions.json", []) as unknown[];
  const glossary = readJson("glossary.json", []) as unknown[];
  const traits = readJson("traits.json", []) as unknown[];

  const indexes: Record<string, unknown[]> = {};
  const creatures: unknown[] = [];

  for (const pack of manifest.packs) {
    const indexPath = join(dataDir, "index", `${pack}.json`);
    if (!existsSync(indexPath)) continue;
    const entries = JSON.parse(readFileSync(indexPath, "utf8")) as IndexEntry[];
    indexes[pack] = entries;
    for (const entry of entries) {
      const file = join(dataDir, "creatures", `${entry.id}.json`);
      if (!existsSync(file)) continue;
      creatures.push(JSON.parse(readFileSync(file, "utf8")));
    }
  }

  return { creatures, books, indexes, conditions, glossary, traits };
}

interface OnDiskFiles {
  /** creature id -> raw file text */
  creatures: Map<string, string>;
  /** relative path (books.json, index/<pack>.json, conditions.json,
   * glossary.json, traits.json, SCHEMA.md) -> raw file text */
  others: Map<string, string>;
}

/** Reads the raw text of every emitted file (creature and non-creature
 * alike) so `update` can detect a change confined to a non-creature file --
 * see Task C3. Does not read manifest.json itself: its fields (other than
 * `generatedAt`, which would self-trigger) are folded into `others` by the
 * caller instead -- see N3. A corrupt on-disk file is left to throw; the
 * caller treats that as a verification failure. */
function readOnDiskFiles(manifest: Manifest | null, dataDir: string): OnDiskFiles {
  const creatures = new Map<string, string>();
  const others = new Map<string, string>();
  if (manifest === null) return { creatures, others };

  const tryReadOther = (relPath: string): void => {
    const abs = join(dataDir, relPath);
    if (existsSync(abs)) others.set(relPath, readFileSync(abs, "utf8"));
  };

  tryReadOther("books.json");
  tryReadOther("conditions.json");
  tryReadOther("glossary.json");
  tryReadOther("traits.json");
  tryReadOther("SCHEMA.md");

  for (const pack of manifest.packs) {
    const indexRel = `index/${pack}.json`;
    tryReadOther(indexRel);
    const indexAbs = join(dataDir, indexRel);
    if (!existsSync(indexAbs)) continue;
    const entries = JSON.parse(readFileSync(indexAbs, "utf8")) as IndexEntry[];
    for (const entry of entries) {
      const file = join(dataDir, "creatures", `${entry.id}.json`);
      if (existsSync(file)) creatures.set(entry.id, readFileSync(file, "utf8"));
    }
  }

  return { creatures, others };
}

export function runCli(argv: string[], io: CliIo, deps: CliDeps = DEFAULT_DEPS): number {
  let command: Command;
  try {
    command = parseArgs(argv);
  } catch (error) {
    io.err(`${(error as Error).message}\n`);
    return EXIT.usageError;
  }

  const { dataDir, cacheDir, configPath, runGit } = deps;
  const manifestPath = join(dataDir, "manifest.json");

  const config = loadConfig(configPath);
  const emit = (payload: unknown): void => {
    if (!io.isTty) io.out(stableStringify(payload));
  };

  let manifest: Manifest | null;
  try {
    manifest = readManifest(manifestPath);
  } catch (error) {
    io.err(`verification failed: manifest.json is invalid: ${(error as Error).message}\n`);
    emit({ command: command.name, ok: false, failures: [`manifest: ${(error as Error).message}`] });
    return EXIT.verifyFailed;
  }

  if (command.name === "status") {
    io.err(
      manifest === null
        ? "No dataset generated yet. Run: pf2data update --latest\n"
        : `Pinned to ${manifest.upstreamRef}, ${manifest.creatureCount} creatures, generated ${manifest.generatedAt}\n`,
    );
    emit({ command: "status", manifest });
    return EXIT.unchanged;
  }

  if (command.name === "verify") {
    if (manifest === null) {
      io.err("No dataset generated yet. Run: pf2data update --latest\n");
      emit({ command: "verify", ok: false, failures: ["no dataset"] });
      return EXIT.verifyFailed;
    }

    // readDataset/readOnDiskFiles fall back to [] for an absent file, so a
    // DELETED emitted file (as opposed to one that never existed) has to be
    // caught here, before that fallback can mask it -- see N2. Every file
    // the manifest implies should exist: the four fixed top-level files, and
    // an index for every pack the manifest lists that is actually a
    // creatures-kind pack (the only kind that ever gets an index file).
    const missingFiles: string[] = [];
    for (const relPath of ["books.json", "conditions.json", "glossary.json", "traits.json", "SCHEMA.md"]) {
      if (!existsSync(join(dataDir, relPath))) missingFiles.push(relPath);
    }
    const creaturePacks = new Set(
      config.packs.filter((p) => p.kind === "creatures").map((p) => p.name),
    );
    for (const pack of manifest.packs) {
      if (!creaturePacks.has(pack)) continue;
      const relPath = `index/${pack}.json`;
      if (!existsSync(join(dataDir, relPath))) missingFiles.push(relPath);
    }
    if (missingFiles.length > 0) {
      const failures = missingFiles.map((p) => `missing: ${p} does not exist`);
      for (const failure of failures) io.err(`${failure}\n`);
      emit({ command: "verify", ok: false, failures });
      return EXIT.verifyFailed;
    }

    let onDisk: OnDiskDataset;
    try {
      onDisk = readDataset(manifest, dataDir);
    } catch (error) {
      io.err(`verification failed: corrupt dataset: ${(error as Error).message}\n`);
      emit({ command: "verify", ok: false, failures: [`dataset: ${(error as Error).message}`] });
      return EXIT.verifyFailed;
    }
    const result = verifyDataset({
      creatures: onDisk.creatures,
      books: onDisk.books,
      indexes: onDisk.indexes,
      conditions: onDisk.conditions,
      glossary: onDisk.glossary,
      traits: onDisk.traits,
      manifest,
    });
    for (const failure of result.failures) io.err(`${failure}\n`);
    if (result.ok) io.err("dataset verified\n");
    emit({ command: "verify", ok: result.ok, failures: result.failures });
    return result.ok ? EXIT.unchanged : EXIT.verifyFailed;
  }

  let fetched;
  try {
    fetched = fetchUpstream({
      config,
      cacheDir,
      pinnedRef: manifest?.upstreamRef ?? null,
      useLatest: command.latest,
      run: runGit,
    });
  } catch (error) {
    io.err(`upstream error: ${(error as Error).message}\n`);
    emit({ command: command.name, error: (error as Error).message });
    return EXIT.upstreamError;
  }

  // The lang table is loaded BEFORE normalization (not just before
  // buildGlossary) so normalizeCreature can resolve @Localize placeholders
  // in ability descriptions (Grab, Attack of Opportunity, ...) -- see C1.
  let lang;
  try {
    lang = loadGlossaryLang(fetched.langPath);
  } catch (error) {
    io.err(`upstream error: ${(error as Error).message}\n`);
    emit({ command: command.name, error: (error as Error).message });
    return EXIT.upstreamError;
  }

  // Any throw escaping normalizePacks itself (as opposed to a per-creature
  // failure, which is caught internally and reported via `.failures`) means
  // a pack directory is missing or unreadable -- e.g. upstream renamed or
  // removed a pack. That is an upstream problem, not a verification one.
  let normalized;
  try {
    normalized = normalizePacks(fetched.packsDir, config, lang);
  } catch (error) {
    io.err(`upstream error: ${(error as Error).message}\n`);
    emit({ command: command.name, error: (error as Error).message });
    return EXIT.upstreamError;
  }
  if (normalized.failures.length > 0) {
    for (const failure of normalized.failures) io.err(`${failure}\n`);
    emit({ command: command.name, ok: false, failures: normalized.failures });
    return EXIT.verifyFailed;
  }
  const creatures = normalized.creatures;
  const build = buildIndexes(creatures);

  const conditionPacks = config.packs.filter((p) => p.kind === "conditions").map((p) => p.name);
  const glossaryPacks = config.packs.filter((p) => p.kind === "glossary").map((p) => p.name);

  let conditions, glossary, traits;
  try {
    conditions = buildConditions(fetched.packsDir, lang, conditionPacks);
    glossary = buildGlossary(fetched.packsDir, lang, glossaryPacks);
    traits = buildTraits(lang);
  } catch (error) {
    io.err(`upstream error: ${(error as Error).message}\n`);
    emit({ command: command.name, error: (error as Error).message });
    return EXIT.upstreamError;
  }

  const schemaDoc = renderSchemaDoc();

  const nextManifest: Manifest = {
    toolVersion: TOOL_VERSION,
    upstreamRepo: config.upstream.repo,
    upstreamRef: fetched.ref,
    generatedAt: manifest?.generatedAt ?? new Date().toISOString(),
    packs: config.packs.map((p) => p.name),
    creatureCount: creatures.length,
    collisions: build.collisions,
  };

  const verification = verifyDataset({
    creatures,
    books: build.books,
    indexes: build.indexes,
    conditions,
    glossary,
    traits,
    manifest: nextManifest,
  });

  if (!verification.ok) {
    for (const failure of verification.failures) io.err(`${failure}\n`);
    emit({ command: command.name, ok: false, failures: verification.failures });
    return EXIT.verifyFailed;
  }

  let onDisk: OnDiskFiles;
  try {
    onDisk = readOnDiskFiles(manifest, dataDir);
  } catch (error) {
    io.err(`verification failed: corrupt dataset: ${(error as Error).message}\n`);
    emit({ command: command.name, ok: false, failures: [`dataset: ${(error as Error).message}`] });
    return EXIT.verifyFailed;
  }

  // Two diffs: `creatureDiff` is the documented, agent-facing "what changed"
  // report (creature ids only). `otherDiff` covers every other emitted file
  // (index/<pack>.json, books.json, conditions.json, glossary.json,
  // traits.json, SCHEMA.md) plus the manifest's own non-generatedAt fields, purely to
  // decide the change status -- see C3 and N3. Without the manifest fields
  // here, a change to `upstreamRef` or `toolVersion` alone (every other
  // emitted file byte-identical) reported "unchanged" and exit 0.
  // `generatedAt` is excluded because it would self-trigger: it is not
  // reassigned to "now" until AFTER `status` is decided, a few lines below.
  const nextCreatureRaw = new Map(creatures.map((c) => [c.id, stableStringify(c)]));
  const creatureDiff = diffDataset(onDisk.creatures, nextCreatureRaw);

  const withoutGeneratedAt = ({ generatedAt: _generatedAt, ...rest }: Manifest): Omit<Manifest, "generatedAt"> => rest;

  const nextOtherRaw = new Map<string, string>();
  for (const [pack, entries] of Object.entries(build.indexes)) {
    nextOtherRaw.set(`index/${pack}.json`, stableStringify(entries));
  }
  nextOtherRaw.set("books.json", stableStringify(build.books));
  nextOtherRaw.set("conditions.json", stableStringify(conditions));
  nextOtherRaw.set("glossary.json", stableStringify(glossary));
  nextOtherRaw.set("traits.json", stableStringify(traits));
  nextOtherRaw.set("SCHEMA.md", schemaDoc);
  nextOtherRaw.set("manifest.json", stableStringify(withoutGeneratedAt(nextManifest)));
  if (manifest !== null) {
    onDisk.others.set("manifest.json", stableStringify(withoutGeneratedAt(manifest)));
  }
  const otherDiff = diffDataset(onDisk.others, nextOtherRaw);

  const otherFilesChanged = statusOf(otherDiff) === "updated";
  const status: ChangeStatus =
    statusOf(creatureDiff) === "updated" || otherFilesChanged ? "updated" : "unchanged";

  if (status === "updated") {
    nextManifest.generatedAt = new Date().toISOString();
  }

  for (const id of creatureDiff.removed) {
    rmSync(join(dataDir, "creatures", `${id}.json`), { force: true });
  }
  // A pack that loses its last creature has no entry in build.indexes, so the
  // write loop below never touches (or removes) its old index file, even
  // though the creature files it pointed at were just deleted above. Delete
  // any pack the previous manifest indexed that build.indexes no longer has.
  for (const pack of manifest?.packs ?? []) {
    if (!(pack in build.indexes)) {
      rmSync(join(dataDir, "index", `${pack}.json`), { force: true });
    }
  }
  for (const creature of creatures) {
    writeJson(join(dataDir, "creatures", `${creature.id}.json`), creature);
  }
  for (const [pack, entries] of Object.entries(build.indexes)) {
    writeJson(join(dataDir, "index", `${pack}.json`), entries);
  }
  writeJson(join(dataDir, "books.json"), build.books);
  writeJson(join(dataDir, "conditions.json"), conditions);
  writeJson(join(dataDir, "glossary.json"), glossary);
  writeJson(join(dataDir, "traits.json"), traits);
  writeJson(manifestPath, nextManifest);
  writeFileSync(join(dataDir, "SCHEMA.md"), schemaDoc, "utf8");

  io.err(
    `${status}: +${creatureDiff.added.length} -${creatureDiff.removed.length} ~${creatureDiff.modified.length}` +
      `${otherFilesChanged ? " (other emitted files also changed)" : ""} at ${fetched.ref}\n`,
  );
  emit({
    command: "update",
    ok: true,
    status,
    upstreamRef: fetched.ref,
    creatureCount: creatures.length,
    otherFilesChanged,
    ...creatureDiff,
  });

  return status === "updated" ? EXIT.updated : EXIT.unchanged;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  process.exit(
    runCli(process.argv.slice(2), {
      out: (s) => process.stdout.write(s),
      err: (s) => process.stderr.write(s),
      isTty: process.stdout.isTTY === true,
    }),
  );
}
