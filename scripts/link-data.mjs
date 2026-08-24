import { mkdirSync, rmSync, symlinkSync, existsSync } from "node:fs";
import { resolve } from "node:path";

// Vite's publicDir is copied verbatim into the build. The dataset lives at the
// repo root, so expose it under data-public/data without duplicating 13 MB.
const root = resolve(import.meta.dirname, "..");
const publicDir = resolve(root, "data-public");
const link = resolve(publicDir, "data");

mkdirSync(publicDir, { recursive: true });
if (existsSync(link)) rmSync(link, { recursive: true, force: true });
symlinkSync(resolve(root, "data"), link, "dir");
console.log("linked data/ into data-public/");
