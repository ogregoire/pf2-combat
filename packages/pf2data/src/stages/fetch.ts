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

/** Glossary ability text lives here, not in the packs. See Task 18. */
export const LANG_PATH = "static/lang/en.json";

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
      LANG_PATH,
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
