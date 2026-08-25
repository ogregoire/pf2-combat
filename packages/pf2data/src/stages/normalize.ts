import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Creature } from "@pf2/schema";
import type { Pf2DataConfig } from "../config.js";
import { walkPack } from "../io/walk.js";
import { normalizeCreatureWithItems, type CreatureItemIds } from "../normalize/creature.js";
import type { LangTable } from "../normalize/localize.js";
import { compareStrings } from "../util.js";

export interface NormalizeResult {
  creatures: Creature[];
  /** creature id -> the Foundry item ids behind its actions/attacks, which
   * `CreatureSchema.parse` strips from the creature itself. The French
   * overlay joins Babele's per-item translations on these. */
  items: Map<string, CreatureItemIds>;
  failures: string[];
}

// A directory-level failure (e.g. walkPack's readdirSync throwing ENOENT
// because upstream renamed or removed a pack) is deliberately NOT caught
// here: it propagates to the caller, which treats it as an upstream error
// rather than a per-creature verification failure. Only normalizeCreature's
// per-file failures are caught and collected below.
export function normalizePacks(
  packsDir: string,
  config: Pf2DataConfig,
  lang: LangTable,
): NormalizeResult {
  const creatures: Creature[] = [];
  const items = new Map<string, CreatureItemIds>();
  const failures: string[] = [];

  for (const pack of config.packs) {
    if (pack.kind !== "creatures") continue;
    for (const file of walkPack(join(packsDir, pack.name))) {
      const raw: unknown = JSON.parse(readFileSync(file.absolutePath, "utf8"));
      if ((raw as { type?: string }).type !== "npc") continue;
      try {
        const normalized = normalizeCreatureWithItems(raw, pack.name, file.slug, lang);
        creatures.push(normalized.creature);
        items.set(normalized.creature.id, normalized.items);
      } catch (error) {
        failures.push(`${pack.name}/${file.slug}: ${(error as Error).message}`);
      }
    }
  }

  return {
    creatures: creatures.sort((a, b) => compareStrings(a.id, b.id)),
    items,
    failures,
  };
}
