import { readdirSync } from "node:fs";
import { join, basename } from "node:path";

export interface PackFile {
  slug: string;
  absolutePath: string;
}

export function walkPack(packRoot: string): PackFile[] {
  const found: PackFile[] = [];

  const visit = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        visit(full);
        continue;
      }
      if (!entry.name.endsWith(".json")) continue;
      if (entry.name.startsWith("_")) continue;
      found.push({ slug: basename(entry.name, ".json"), absolutePath: full });
    }
  };

  visit(packRoot);
  return found.sort((a, b) => a.slug.localeCompare(b.slug));
}
