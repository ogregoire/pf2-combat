#!/usr/bin/env -S npx tsx
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  CreatureI18nSchema,
  CreatureSchema,
  ManifestSchema,
  type CreatureI18n,
  type IndexEntry,
  type Manifest,
} from "@pf2/schema";
import { loadConfig } from "./config.js";
import { writeJson, stableStringify } from "./io/write.js";
import { fetchFrench, fetchUpstream, type RunGit } from "./stages/fetch.js";
import { normalizePacks } from "./stages/normalize.js";
import { buildIndexes } from "./stages/index.js";
import { verifyDataset, verifyI18n, verifyI18nMarkup } from "./stages/verify.js";
import { diffDataset, frenchCoverage, statusOf, type ChangeStatus } from "./report.js";
import { compareStrings } from "./util.js";
import { loadGlossaryLang } from "./normalize/localize.js";
import { buildConditions, buildGlossary, buildTraits, scanTraits } from "./stages/reference.js";
import { loadBabele } from "./stages/babele.js";
import { loadArchive } from "./stages/archive.js";
import {
  buildConditionsI18n,
  buildCreatureI18n,
  buildGlossaryI18n,
  buildIndexI18n,
  buildTraitsI18n,
} from "./stages/i18n.js";
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
  /** The French module's checkout. MUST be distinct from `cacheDir`: both
   * stages drive `git sparse-checkout set` on their own directory, and a
   * shared one would have the two upstreams overwrite each other's cone. */
  frCacheDir: string;
  configPath: string;
  runGit?: RunGit; // forwarded to fetchUpstream/fetchFrench; undefined means the real git CLI
}

const ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const TOOL_VERSION = "0.1.0";

const DEFAULT_DEPS: CliDeps = {
  dataDir: join(ROOT, "data"),
  cacheDir: join(ROOT, ".cache", "pf2e"),
  frCacheDir: join(ROOT, ".cache", "pf2e-fr"),
  configPath: join(ROOT, "packages/pf2data/pf2data.config.json"),
};

/** Everything under `data/i18n/` is emitted, so `update` owns the whole tree:
 * a file it no longer produces (a creature that lost its French entry, a pack
 * that went away) has to be deleted, not left behind to be served as stale
 * translation. */
const I18N_ROOT = "i18n";

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

/** Every emitted French file currently on disk, keyed by its path relative to
 * `dataDir` (`i18n/fr/creatures/<pack>/<slug>.json`, ...). Read as raw text
 * for the same reason the creature files are: the comparison that decides
 * "changed" has to be byte-for-byte against what `writeJson` would produce. */
function readOnDiskI18n(dataDir: string): Map<string, string> {
  const files = new Map<string, string>();
  const root = join(dataDir, I18N_ROOT);
  if (!existsSync(root)) return files;

  const visit = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        visit(full);
        continue;
      }
      if (!entry.name.endsWith(".json")) continue;
      files.set(relative(dataDir, full).split(sep).join("/"), readFileSync(full, "utf8"));
    }
  };

  visit(root);
  return files;
}

/** Checks every committed French overlay against the committed creature it
 * indexes. See `verifyI18n`: the overlay is keyed by array POSITION, so the
 * two files agreeing position-for-position is the whole safety property. A
 * missing overlay is not a failure: no creature currently lacks one (Task 17
 * closed the last 30 gaps via the archive), but a future upstream addition
 * with no Babele or archive coverage at all would legitimately have none. */
function verifyOnDiskI18n(creatures: unknown[], dataDir: string): string[] {
  const problems: string[] = [];

  for (const raw of creatures) {
    const parsed = CreatureSchema.safeParse(raw);
    if (!parsed.success) continue; // already reported by verifyDataset
    const creature = parsed.data;

    const path = join(dataDir, I18N_ROOT, "fr", "creatures", `${creature.id}.json`);
    if (!existsSync(path)) continue;

    const overlay = CreatureI18nSchema.safeParse(
      JSON.parse(readFileSync(path, "utf8")),
    );
    if (!overlay.success) {
      problems.push(
        `i18n: ${creature.id}: overlay is invalid: ${overlay.error.issues[0]?.message ?? "invalid"}`,
      );
      continue;
    }

    problems.push(...verifyI18n(creature, overlay.data));
  }

  const indexDir = join(dataDir, I18N_ROOT, "fr", "index");
  const referenceFiles = existsSync(indexDir)
    ? readdirSync(indexDir)
        .filter((name) => name.endsWith(".json"))
        .sort(compareStrings)
        .map((name) => `index/${name}`)
    : [];
  for (const file of [...referenceFiles, "conditions.json", "glossary.json", "traits.json"]) {
    const path = join(dataDir, I18N_ROOT, "fr", ...file.split("/"));
    if (!existsSync(path)) continue;
    problems.push(
      ...verifyI18nMarkup(`${I18N_ROOT}/fr/${file}`, JSON.parse(readFileSync(path, "utf8"))),
    );
  }

  return problems;
}

export function runCli(argv: string[], io: CliIo, deps: CliDeps = DEFAULT_DEPS): number {
  let command: Command;
  try {
    command = parseArgs(argv);
  } catch (error) {
    io.err(`${(error as Error).message}\n`);
    return EXIT.usageError;
  }

  const { dataDir, cacheDir, frCacheDir, configPath, runGit } = deps;
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

    // The committed overlay is checked against the committed creature, not
    // just against the one `update` happened to build in memory: the two are
    // separate files that can drift apart between runs, and a position that
    // no longer names the action it translates would otherwise ship as a
    // quietly mistranslated Strike.
    const failures = [...result.failures, ...verifyOnDiskI18n(onDisk.creatures, dataDir)];
    for (const failure of failures) io.err(`${failure}\n`);
    const ok = failures.length === 0;
    if (ok) io.err("dataset verified\n");
    emit({ command: "verify", ok, failures });
    return ok ? EXIT.unchanged : EXIT.verifyFailed;
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

  // --- French overlay -------------------------------------------------
  // `--latest` moves BOTH pins. One flag, deliberately: the GM running this
  // is the only operator, and two flags would be ceremony without a user.
  // An empty `frRef` means "never pinned" -- the field only exists from this
  // version on, so an older manifest carries "" and must be treated as absent
  // rather than checked out as a ref.
  let french;
  try {
    french = fetchFrench({
      config,
      cacheDir: frCacheDir,
      pinnedRef: manifest?.frRef ? manifest.frRef : null,
      useLatest: command.latest,
      run: runGit,
    });
  } catch (error) {
    io.err(`upstream error: ${(error as Error).message}\n`);
    emit({ command: command.name, error: (error as Error).message });
    return EXIT.upstreamError;
  }

  let babele, frLang, archive;
  try {
    babele = loadBabele(french.babeleDir);
    frLang = loadGlossaryLang(french.langPath);
    // Retired-module fallback -- Task 17. Loaded eagerly alongside the live
    // Babele table (not lazily on first miss) so a broken archive checkout
    // surfaces as the same upstream error, at the same point in the run, as
    // a broken Babele one.
    archive = loadArchive(french.archiveDir);
  } catch (error) {
    io.err(`upstream error: ${(error as Error).message}\n`);
    emit({ command: command.name, error: (error as Error).message });
    return EXIT.upstreamError;
  }

  // The overlay is joined per creature on its OWN pack (the id prefix, the
  // same derivation `buildIndexI18n` uses): `Shambler` is "Tertre errant" in
  // the Kingmaker bestiary and "Grand tertre" in Bestiary 1, so the English
  // name alone cannot decide. A creature Babele does not cover gets NO file
  // at all -- never an English echo -- and shows up in the coverage report.
  const creatureI18n = new Map<string, CreatureI18n>();
  let indexI18n: Record<string, Record<string, string>>;
  let conditionsI18n, glossaryI18n, traitsI18n;
  try {
    for (const creature of creatures) {
      const items = normalized.items.get(creature.id);
      if (items === undefined) continue;
      const overlay = buildCreatureI18n({
        creatureName: creature.name,
        creatureFoundryId: creature.foundryId,
        ownPack: creature.id.slice(0, creature.id.indexOf("/")),
        actions: items.actions,
        attacks: items.attacks,
        table: babele,
        lang: frLang,
        archive,
      });
      if (overlay !== null) creatureI18n.set(creature.id, overlay);
    }

    // `IndexEntry` (the committed `index/<pack>.json` shape) carries no
    // `foundryId` -- it is public, app-consumed data, and widening it for
    // this pipeline-internal join would churn every committed index file for
    // no user-visible reason. The creatures already in hand carry it, so the
    // join happens here instead, entirely in memory.
    const foundryIdById = new Map(creatures.map((c) => [c.id, c.foundryId]));
    indexI18n = {};
    for (const [pack, entries] of Object.entries(build.indexes)) {
      indexI18n[pack] = buildIndexI18n(
        entries.map((entry) => ({
          id: entry.id,
          name: entry.name,
          foundryId: foundryIdById.get(entry.id)!,
        })),
        babele,
        archive,
      );
    }
    conditionsI18n = buildConditionsI18n(conditions, babele, frLang);
    glossaryI18n = buildGlossaryI18n(glossary, babele, frLang);
    traitsI18n = buildTraitsI18n(traits.map((t) => t.slug), scanTraits(frLang));
  } catch (error) {
    // `lookup` throws when two same-kind Babele files disagree about a name.
    // That is an upstream inconsistency, not a defect in our dataset.
    io.err(`upstream error: ${(error as Error).message}\n`);
    emit({ command: command.name, error: (error as Error).message });
    return EXIT.upstreamError;
  }

  // The guard the index-keying scheme depends on: every overlay position must
  // still name the action/attack it was built from. An upstream reorder has
  // to fail loudly here, never ship as a quietly mistranslated Strike.
  const i18nProblems: string[] = [];
  for (const creature of creatures) {
    const overlay = creatureI18n.get(creature.id);
    if (overlay === undefined) continue;
    i18nProblems.push(...verifyI18n(creature, overlay));
  }
  // `verifyI18n` carries the markup check for creature overlays; every other
  // emitted French file has no creature to align against, so it is checked for
  // markers directly. The index overlay is 1420 Babele NAME strings and is
  // clean today -- guarded anyway, because "clean today" is exactly what was
  // true of the creature descriptions before anyone looked.
  for (const [pack, entries] of Object.entries(indexI18n)) {
    i18nProblems.push(...verifyI18nMarkup(`i18n/fr/index/${pack}.json`, entries));
  }
  i18nProblems.push(
    ...verifyI18nMarkup("i18n/fr/conditions.json", conditionsI18n),
    ...verifyI18nMarkup("i18n/fr/glossary.json", glossaryI18n),
    ...verifyI18nMarkup("i18n/fr/traits.json", traitsI18n),
  );
  if (i18nProblems.length > 0) {
    for (const problem of i18nProblems) io.err(`${problem}\n`);
    emit({ command: command.name, ok: false, failures: i18nProblems });
    return EXIT.verifyFailed;
  }

  const coverage = frenchCoverage(
    creatures.map((c) => c.id),
    new Set(creatureI18n.keys()),
  );

  const schemaDoc = renderSchemaDoc();

  const nextManifest: Manifest = {
    toolVersion: TOOL_VERSION,
    upstreamRepo: config.upstream.repo,
    upstreamRef: fetched.ref,
    frRepo: config.french.repo,
    frRef: french.ref,
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
  let onDiskI18n: Map<string, string>;
  try {
    onDisk = readOnDiskFiles(manifest, dataDir);
    onDiskI18n = readOnDiskI18n(dataDir);
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

  // The French tree is diffed as its own map rather than folded into
  // `others`, because unlike the fixed English file set it GROWS AND SHRINKS:
  // a creature that loses its Babele entry stops producing a file, and the
  // stale one has to be deleted rather than left behind to be served as a
  // translation that no longer exists.
  const nextI18n = new Map<string, unknown>();
  for (const [id, overlay] of creatureI18n) {
    nextI18n.set(`${I18N_ROOT}/fr/creatures/${id}.json`, overlay);
  }
  for (const [pack, entries] of Object.entries(indexI18n)) {
    nextI18n.set(`${I18N_ROOT}/fr/index/${pack}.json`, entries);
  }
  nextI18n.set(`${I18N_ROOT}/fr/conditions.json`, conditionsI18n);
  nextI18n.set(`${I18N_ROOT}/fr/glossary.json`, glossaryI18n);
  nextI18n.set(`${I18N_ROOT}/fr/traits.json`, traitsI18n);
  const nextI18nRaw = new Map(
    [...nextI18n].map(([relPath, value]) => [relPath, stableStringify(value)] as const),
  );
  const i18nDiff = diffDataset(onDiskI18n, nextI18nRaw);

  const otherFilesChanged =
    statusOf(otherDiff) === "updated" || statusOf(i18nDiff) === "updated";
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
  for (const relPath of i18nDiff.removed) {
    rmSync(join(dataDir, ...relPath.split("/")), { force: true });
  }
  for (const [relPath, value] of nextI18n) {
    writeJson(join(dataDir, ...relPath.split("/")), value);
  }
  writeJson(manifestPath, nextManifest);
  writeFileSync(join(dataDir, "SCHEMA.md"), schemaDoc, "utf8");

  io.err(
    `${status}: +${creatureDiff.added.length} -${creatureDiff.removed.length} ~${creatureDiff.modified.length}` +
      `${otherFilesChanged ? " (other emitted files also changed)" : ""} at ${fetched.ref}\n`,
  );
  // The untranslated LIST, not just the count: a coverage drop that only
  // showed up as a smaller number would never say which creature lost its
  // translation. 0 today (Task 17 closed the last 30 gaps via the archive),
  // but the list is what would name a regression the moment one reappears.
  io.err(
    `french: ${coverage.translated}/${coverage.total} creatures translated at ${french.ref}` +
      `${coverage.untranslated.length > 0 ? `, ${coverage.untranslated.length} untranslated: ${coverage.untranslated.join(", ")}` : ""}\n`,
  );
  emit({
    command: "update",
    ok: true,
    status,
    upstreamRef: fetched.ref,
    frRef: french.ref,
    creatureCount: creatures.length,
    otherFilesChanged,
    french: coverage,
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
