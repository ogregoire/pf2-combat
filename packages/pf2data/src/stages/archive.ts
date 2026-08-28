import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { compareStrings } from "../util.js";

/** One Name/Nom translation unit -- a creature or one of its child items.
 * `fr` and `description` are nullable: 2 real item names in the legacy
 * bestiary have an empty `Nom:` line, and 634 of 1350 legacy records carry
 * no French body at all. */
export interface ArchiveItem {
  en: string;
  fr: string | null;
  description: string | null;
}

/** A full `archive/<pack>/<foundryId>.htm` record: the creature's own
 * Name/Nom/description, plus its child items keyed by THEIR OWN foundry id
 * (the `ID:` line) -- the same join key `buildCreatureI18n` already uses for
 * Babele's `entry.items`. */
export interface ArchiveRecord extends ArchiveItem {
  items: Record<string, ArchiveItem>;
}

const DESC_EN = "-- Desc (en) --";
const DESC_FR = "-- Desc (fr) --";
const DESC_END = "-- End desc ---";
const NAME_LINE = /^Name: (.*)$/m;
const NOM_LINE = /^Nom: (.*)$/m;
const ID_LINE = /^ID: (.*)$/m;
/** Splits a record into its own preamble and one chunk per child item,
 * keeping each chunk's `ID: ` line as its own first line (a lookahead, not
 * a consuming match). */
const ITEM_SPLIT = /(?=^ID: .*$)/m;

/**
 * Pulls the (en, fr) description pair out of ONE Name/Nom unit's own text --
 * never the whole file. Records repeat the `-- Desc (en) --` / `-- Desc (fr)
 * --` / `-- End desc ---` triad once per item that has a body, so a scan that
 * collected every `-- Desc (fr) --` block in the file and zipped it against
 * every `-- Desc (en) --` block by index would mis-pair as soon as one item
 * in between has no body of its own (634 of 1350 legacy records have none at
 * all). Scoping the search to a single item's slice of text, and taking the
 * FIRST `-- Desc (en) --`/`-- Desc (fr) --` pair in it, sidesteps that: every
 * item's markers are only ever nested inside that item's own chunk.
 */
function extractDescription(text: string): string | null {
  const enStart = text.indexOf(DESC_EN);
  if (enStart === -1) return null;

  const frStart = text.indexOf(DESC_FR, enStart + DESC_EN.length);
  if (frStart === -1) return null;

  const afterFr = frStart + DESC_FR.length;
  const endStart = text.indexOf(DESC_END, afterFr);
  const fr = text.slice(afterFr, endStart === -1 ? text.length : endStart).trim();
  return fr.length > 0 ? fr : null;
}

function line(text: string, pattern: RegExp): string | null {
  const match = pattern.exec(text);
  if (match === null) return null;
  const value = match[1]!.trim();
  return value.length > 0 ? value : null;
}

function parseItem(text: string): ArchiveItem {
  return {
    en: line(text, NAME_LINE) ?? "",
    fr: line(text, NOM_LINE),
    description: extractDescription(text),
  };
}

function parseRecord(text: string): ArchiveRecord {
  const [preamble, ...itemChunks] = text.split(ITEM_SPLIT);

  const items: Record<string, ArchiveItem> = {};
  for (const chunk of itemChunks) {
    const id = line(chunk, ID_LINE);
    if (id === null) continue;
    items[id] = parseItem(chunk);
  }

  return { ...parseItem(preamble!), items };
}

/**
 * Reads every `archive/<pack>/<foundryId>.htm` record into one flat table
 * keyed by foundry id. Foundry ids are unique across the whole module (a
 * random 16-character string), so -- unlike Babele's per-pack `byPack` --
 * no pack scoping is needed to join a creature to its record: it's exactly
 * the id already on `Creature.foundryId`.
 *
 * Read in `compareStrings` order, both across pack directories and within
 * each one, never raw `readdirSync` order -- the archive is only ever
 * consulted as a fallback, but the table itself still has to build
 * deterministically across machines.
 */
export function loadArchive(archiveDir: string): Map<string, ArchiveRecord> {
  const table = new Map<string, ArchiveRecord>();

  const packs = readdirSync(archiveDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort(compareStrings);

  for (const pack of packs) {
    const packDir = join(archiveDir, pack);
    const files = readdirSync(packDir)
      .filter((name) => name.endsWith(".htm"))
      .sort(compareStrings);

    for (const file of files) {
      const foundryId = file.slice(0, -".htm".length);
      const text = readFileSync(join(packDir, file), "utf8");
      table.set(foundryId, parseRecord(text));
    }
  }

  return table;
}
