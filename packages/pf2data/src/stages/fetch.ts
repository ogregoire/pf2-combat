import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Pf2DataConfig } from "../config.js";

export type RunGit = (args: string[], cwd: string) => string;

export interface FetchOptions {
  config: Pf2DataConfig;
  cacheDir: string;
  pinnedRef: string | null;
  useLatest: boolean;
  run?: RunGit;
}

export interface FetchResult {
  ref: string;
  packsDir: string;
  langPath: string;
}

export interface FetchFrenchResult {
  ref: string;
  babeleDir: string;
  langPath: string;
}

/** Glossary ability text lives here, not in the packs. See Task 18. */
export const LANG_PATH = "static/lang/en.json";

/**
 * Sparse-checkout runs in cone mode, which accepts DIRECTORY patterns only:
 * passing the bare file path above makes git fail with
 * "fatal: 'static/lang/en.json' is not a directory". The whole directory is
 * 4 files / ~1 MB, so checking it out wholesale costs nothing.
 */
export const LANG_DIR = "static/lang";

const defaultRun: RunGit = (args, cwd) =>
  execFileSync("git", args, { cwd, encoding: "utf8" });

export function fetchUpstream(options: FetchOptions): FetchResult {
  const { config, cacheDir, pinnedRef, useLatest } = options;
  const run = options.run ?? defaultRun;

  if (pinnedRef === null && !useLatest) {
    throw new Error(
      "No pinned ref in data/manifest.json. Run with --latest to create one.",
    );
  }

  // No rollback on partial failure, deliberately. Every step here is
  // retry-safe: a failed `checkout` still leaves a valid `.git`, and the next
  // run redoes fetch + sparse-checkout + checkout from scratch. An interrupted
  // initial clone surfaces as a visible git error (exit code 30) on the next
  // run, not as silent corruption. Recovery is `rm -rf .cache`.
  if (!existsSync(join(cacheDir, ".git"))) {
    run(
      [
        "clone",
        "--filter=blob:none",
        "--sparse",
        "--branch",
        config.upstream.branch,
        config.upstream.repo,
        cacheDir,
      ],
      ".",
    );
  } else {
    run(["fetch", "origin", config.upstream.branch], cacheDir);
  }

  run(
    [
      "sparse-checkout",
      "set",
      ...config.packs.map((p) => `packs/${p.name}`),
      LANG_DIR,
    ],
    cacheDir,
  );

  const ref = useLatest
    ? run(["rev-parse", `origin/${config.upstream.branch}`], cacheDir).trim()
    : pinnedRef!;

  run(["checkout", ref], cacheDir);

  return {
    ref,
    packsDir: join(cacheDir, "packs"),
    langPath: join(cacheDir, LANG_PATH),
  };
}

/**
 * The Babele translation module ships four naming variants of the same
 * content (`vf`, `vo`, `vf-vo`, `vo-vf`); we only ever read `vf`. The other
 * three are 138 MB we never touch, so they're excluded from sparse-checkout.
 */
export const FR_BABELE_DIR = "babele/vf/fr";

/**
 * Sparse-checkout runs in cone mode, which accepts DIRECTORY patterns only:
 * a bare file path here would fail the same way `static/lang/en.json` did
 * for the English fetch above.
 */
export const FR_LANG_DIR = "lang";
export const FR_LANG_PATH = "lang/fr.json";

export function fetchFrench(options: FetchOptions): FetchFrenchResult {
  const { config, cacheDir, pinnedRef, useLatest } = options;
  const run = options.run ?? defaultRun;

  if (pinnedRef === null && !useLatest) {
    throw new Error(
      "No pinned ref in data/manifest.json. Run with --latest to create one.",
    );
  }

  // Same no-rollback, retry-safe contract as fetchUpstream. This uses its
  // own cacheDir, distinct from the English checkout's, so the two never
  // fight over sparse-checkout state.
  if (!existsSync(join(cacheDir, ".git"))) {
    run(
      [
        "clone",
        "--filter=blob:none",
        "--sparse",
        "--branch",
        config.french.branch,
        config.french.repo,
        cacheDir,
      ],
      ".",
    );
  } else {
    run(["fetch", "origin", config.french.branch], cacheDir);
  }

  run(["sparse-checkout", "set", FR_BABELE_DIR, FR_LANG_DIR], cacheDir);

  const ref = useLatest
    ? run(["rev-parse", `origin/${config.french.branch}`], cacheDir).trim()
    : pinnedRef!;

  run(["checkout", ref], cacheDir);

  return {
    ref,
    babeleDir: join(cacheDir, FR_BABELE_DIR),
    langPath: join(cacheDir, FR_LANG_PATH),
  };
}
