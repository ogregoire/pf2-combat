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
import { fetchUpstream } from "./stages/fetch.js";
import { normalizePacks } from "./stages/normalize.js";
import { buildIndexes } from "./stages/index.js";
import { verifyDataset } from "./stages/verify.js";
import { diffDataset, statusOf } from "./report.js";

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

const ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const DATA_DIR = join(ROOT, "data");
const CACHE_DIR = join(ROOT, ".cache", "pf2e");
const CONFIG_PATH = join(ROOT, "packages/pf2data/pf2data.config.json");
const MANIFEST_PATH = join(DATA_DIR, "manifest.json");
const TOOL_VERSION = "0.1.0";

function readManifest(): Manifest | null {
  if (!existsSync(MANIFEST_PATH)) return null;
  return ManifestSchema.parse(JSON.parse(readFileSync(MANIFEST_PATH, "utf8")));
}

interface OnDiskDataset {
  creatures: unknown[];
  raw: Map<string, string>;
  books: BookCatalogEntry[];
  indexes: Record<string, IndexEntry[]>;
}

/** Reads the committed dataset. Used by `verify`, and by `update` to diff. */
function readDataset(manifest: Manifest | null): OnDiskDataset {
  const empty: OnDiskDataset = {
    creatures: [],
    raw: new Map(),
    books: [],
    indexes: {},
  };
  if (manifest === null) return empty;

  const booksPath = join(DATA_DIR, "books.json");
  const books: BookCatalogEntry[] = existsSync(booksPath)
    ? JSON.parse(readFileSync(booksPath, "utf8"))
    : [];

  const indexes: Record<string, IndexEntry[]> = {};
  const creatures: unknown[] = [];
  const raw = new Map<string, string>();

  for (const pack of manifest.packs) {
    const indexPath = join(DATA_DIR, "index", `${pack}.json`);
    if (!existsSync(indexPath)) continue;
    const entries: IndexEntry[] = JSON.parse(readFileSync(indexPath, "utf8"));
    indexes[pack] = entries;
    for (const entry of entries) {
      const file = join(DATA_DIR, "creatures", `${entry.id}.json`);
      if (!existsSync(file)) continue;
      const text = readFileSync(file, "utf8");
      raw.set(entry.id, text);
      creatures.push(JSON.parse(text));
    }
  }

  return { creatures, raw, books, indexes };
}

export function runCli(argv: string[], io: CliIo): number {
  let command: Command;
  try {
    command = parseArgs(argv);
  } catch (error) {
    io.err(`${(error as Error).message}\n`);
    return EXIT.usageError;
  }

  const config = loadConfig(CONFIG_PATH);
  const manifest = readManifest();
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
    const onDisk = readDataset(manifest);
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
      cacheDir: CACHE_DIR,
      pinnedRef: manifest?.upstreamRef ?? null,
      useLatest: command.latest,
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

  const previous = readDataset(manifest).raw;
  const next = new Map(creatures.map((c) => [c.id, stableStringify(c)]));
  const diff = diffDataset(previous, next);
  const status = statusOf(diff);

  if (status === "updated") {
    nextManifest.generatedAt = new Date().toISOString();
  }

  for (const id of diff.removed) {
    rmSync(join(DATA_DIR, "creatures", `${id}.json`), { force: true });
  }
  for (const creature of creatures) {
    writeJson(join(DATA_DIR, "creatures", `${creature.id}.json`), creature);
  }
  for (const [pack, entries] of Object.entries(build.indexes)) {
    writeJson(join(DATA_DIR, "index", `${pack}.json`), entries);
  }
  writeJson(join(DATA_DIR, "books.json"), build.books);
  writeJson(MANIFEST_PATH, nextManifest);

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
