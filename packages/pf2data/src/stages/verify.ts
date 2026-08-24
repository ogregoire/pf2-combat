import {
  CreatureSchema,
  type BookCatalogEntry,
  type IndexEntry,
  type Manifest,
} from "@pf2/schema";
import { buildIndexes } from "./index.js";

const ALIGNMENT_TRAITS = new Set([
  "lawful",
  "chaotic",
  "good",
  "evil",
  "neutral",
]);

export interface VerifyInput {
  creatures: unknown[];
  books: BookCatalogEntry[];
  indexes: Record<string, IndexEntry[]>;
  manifest: Manifest;
}

export interface VerifyResult {
  ok: boolean;
  failures: string[];
}

export function verifyDataset(input: VerifyInput): VerifyResult {
  const failures: string[] = [];

  // 1. schema validity
  const parsed = [];
  for (const raw of input.creatures) {
    const result = CreatureSchema.safeParse(raw);
    if (!result.success) {
      const id = (raw as { id?: string }).id ?? "<unknown>";
      failures.push(`schema: ${id}: ${result.error.issues[0]?.message ?? "invalid"}`);
      continue;
    }
    parsed.push(result.data);
  }

  // 2. book counts match index lengths
  for (const book of input.books) {
    const entries = input.indexes[book.pack];
    if (entries === undefined) {
      failures.push(`books: ${book.pack} has no index`);
      continue;
    }
    if (entries.length !== book.creatureCount) {
      failures.push(
        `books: ${book.pack} creatureCount ${book.creatureCount} != index length ${entries.length}`,
      );
    }
  }

  // 3. every index entry has a creature
  const ids = new Set(parsed.map((c) => c.id));
  for (const entries of Object.values(input.indexes)) {
    for (const entry of entries) {
      if (!ids.has(entry.id)) {
        failures.push(`index: ${entry.id} has no creature record`);
      }
    }
  }

  // 4. collision set matches the manifest
  const actual = JSON.stringify(buildIndexes(parsed).collisions);
  const recorded = JSON.stringify(input.manifest.collisions);
  if (actual !== recorded) {
    failures.push(`collisions: computed set ${actual} != manifest set ${recorded}`);
  }

  // 5. no alignment trait survives
  for (const c of parsed) {
    for (const trait of c.traits) {
      if (ALIGNMENT_TRAITS.has(trait)) {
        failures.push(`alignment: ${c.id} still carries trait "${trait}"`);
      }
    }
  }

  // 6. no unresolved uuid links
  for (const c of parsed) {
    if (JSON.stringify(c).includes("@UUID[")) {
      failures.push(`links: ${c.id} contains an unresolved @UUID reference`);
    }
  }

  return { ok: failures.length === 0, failures };
}
