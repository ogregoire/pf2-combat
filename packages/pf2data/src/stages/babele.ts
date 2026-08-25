import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { compareStrings } from "../util.js";

export interface BabeleEntry {
  name: string;
  description?: string;
  blurb?: string;
  items?: Record<string, { name?: string; description?: string }>;
}

/** English creature/condition/glossary name -> its French entry. */
export type BabeleTable = Map<string, BabeleEntry>;

interface Source {
  file: string;
  entry: BabeleEntry;
}

/**
 * Reads every `pf2e.*.json` Babele translation file in `babeleDir` and
 * merges their `entries` objects into one table keyed by English name.
 *
 * Files are read in `compareStrings` filename order so a name that appears
 * in more than one file always resolves the same way on every run. The
 * first file to define a name wins; if a later file defines the same name
 * with a *different* French `name`, that's a real disagreement upstream
 * and this throws rather than silently picking one.
 */
export function loadBabele(babeleDir: string): BabeleTable {
  const files = readdirSync(babeleDir)
    .filter((name) => name.startsWith("pf2e.") && name.endsWith(".json"))
    .sort(compareStrings);

  const table: BabeleTable = new Map();
  const sources = new Map<string, Source>();

  for (const file of files) {
    const raw = JSON.parse(readFileSync(join(babeleDir, file), "utf8"));
    const entries = raw.entries;
    if (entries === null || typeof entries !== "object" || Array.isArray(entries)) {
      continue;
    }

    for (const [englishName, entry] of Object.entries(
      entries as Record<string, BabeleEntry>,
    )) {
      const existing = sources.get(englishName);
      if (existing) {
        if (existing.entry.name !== entry.name) {
          throw new Error(
            `Babele files disagree about the French name for "${englishName}": ` +
              `${existing.file} says "${existing.entry.name}", ` +
              `${file} says "${entry.name}".`,
          );
        }
        continue;
      }
      sources.set(englishName, { file, entry });
      table.set(englishName, entry);
    }
  }

  return table;
}
