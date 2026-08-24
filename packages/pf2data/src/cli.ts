#!/usr/bin/env -S npx tsx
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  ManifestSchema,
  type BookCatalogEntry,
  type IndexEntry,
  type Manifest,
} from "@pf2/schema";
import { loadConfig } from "./config.js";
import { writeJson, stableStringify } from "./io/write.js";
import { fetchUpstream, type RunGit } from "./stages/fetch.js";
import { normalizePacks } from "./stages/normalize.js";
import { buildIndexes } from "./stages/index.js";
import { verifyDataset } from "./stages/verify.js";
import { diffDataset, statusOf } from "./report.js";
import { loadGlossaryLang } from "./normalize/localize.js";
import { buildConditions, buildGlossary } from "./stages/reference.js";

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
    return { name: "update", latest: rest.includes("--latest") };
  }
  if (command === "status") return { name: "status" };
  if (command === "verify") return { name: "verify" };
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

function readManifest(manifestPath: string): Manifest | null {
  if (!existsSync(manifestPath)) return null;
  return ManifestSchema.parse(JSON.parse(readFileSync(manifestPath, "utf8")));
}

interface OnDiskDataset {
  creatures: unknown[];
  raw: Map<string, string>;
  books: BookCatalogEntry[];
  indexes: Record<string, IndexEntry[]>;
}

/** Reads the committed dataset. Used by `verify`, and by `update` to diff. */
function readDataset(manifest: Manifest | null, dataDir: string): OnDiskDataset {
  const empty: OnDiskDataset = {
    creatures: [],
    raw: new Map(),
    books: [],
    indexes: {},
  };
  if (manifest === null) return empty;

  const booksPath = join(dataDir, "books.json");
  const books: BookCatalogEntry[] = existsSync(booksPath)
    ? JSON.parse(readFileSync(booksPath, "utf8"))
    : [];

  const indexes: Record<string, IndexEntry[]> = {};
  const creatures: unknown[] = [];
  const raw = new Map<string, string>();

  for (const pack of manifest.packs) {
    const indexPath = join(dataDir, "index", `${pack}.json`);
    if (!existsSync(indexPath)) continue;
    const entries: IndexEntry[] = JSON.parse(readFileSync(indexPath, "utf8"));
    indexes[pack] = entries;
    for (const entry of entries) {
      const file = join(dataDir, "creatures", `${entry.id}.json`);
      if (!existsSync(file)) continue;
      const text = readFileSync(file, "utf8");
      raw.set(entry.id, text);
      creatures.push(JSON.parse(text));
    }
  }

  return { creatures, raw, books, indexes };
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
  const manifest = readManifest(manifestPath);
  const emit = (payload: unknown): void => {
    if (!io.isTty) io.out(stableStringify(payload));
  };

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
    const onDisk = readDataset(manifest, dataDir);
    const result = verifyDataset({
      creatures: onDisk.creatures,
      books: onDisk.books,
      indexes: onDisk.indexes,
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

  const creatures = normalizePacks(fetched.packsDir, config);
  const build = buildIndexes(creatures);

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
    manifest: nextManifest,
  });

  if (!verification.ok) {
    for (const failure of verification.failures) io.err(`${failure}\n`);
    emit({ command: command.name, ok: false, failures: verification.failures });
    return EXIT.verifyFailed;
  }

  const previous = readDataset(manifest, dataDir).raw;
  const next = new Map(creatures.map((c) => [c.id, stableStringify(c)]));
  const diff = diffDataset(previous, next);
  const status = statusOf(diff);

  if (status === "updated") {
    nextManifest.generatedAt = new Date().toISOString();
  }

  for (const id of diff.removed) {
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

  const lang = loadGlossaryLang(fetched.langPath);
  const glossaryPacks = config.packs
    .filter((p) => p.kind === "glossary")
    .map((p) => p.name);
  writeJson(join(dataDir, "conditions.json"), buildConditions(fetched.packsDir));
  writeJson(
    join(dataDir, "glossary.json"),
    buildGlossary(fetched.packsDir, lang, glossaryPacks),
  );

  writeJson(manifestPath, nextManifest);

  io.err(
    `${status}: +${diff.added.length} -${diff.removed.length} ~${diff.modified.length} at ${fetched.ref}\n`,
  );
  emit({
    command: "update",
    ok: true,
    status,
    upstreamRef: fetched.ref,
    creatureCount: creatures.length,
    ...diff,
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
