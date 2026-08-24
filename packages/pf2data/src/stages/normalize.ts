import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Creature } from "@pf2/schema";
import type { Pf2DataConfig } from "../config.js";
import { walkPack } from "../io/walk.js";
import { normalizeCreature } from "../normalize/creature.js";

export interface NormalizeResult {
  creatures: Creature[];
  failures: string[];
}

export function normalizePacks(
  packsDir: string,
  config: Pf2DataConfig,
): NormalizeResult {
  const creatures: Creature[] = [];
  const failures: string[] = [];

  for (const pack of config.packs) {
    if (pack.kind !== "creatures") continue;
    for (const file of walkPack(join(packsDir, pack.name))) {
      const raw: unknown = JSON.parse(readFileSync(file.absolutePath, "utf8"));
      if ((raw as { type?: string }).type !== "npc") continue;
      try {
        creatures.push(normalizeCreature(raw, pack.name, file.slug));
      } catch (error) {
        failures.push(`${pack.name}/${file.slug}: ${(error as Error).message}`);
      }
    }
  }

  return {
    creatures: creatures.sort((a, b) => a.id.localeCompare(b.id)),
    failures,
  };
}
