import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { Encounter, Player } from "./types.js";

/**
 * Bumped whenever a persisted payload's shape changes in a way old data
 * can't just be read as-is. `migrate` is the single place that reconciles
 * an old payload with the current shape — every read goes through it, so a
 * fight saved weeks ago under an older version still opens.
 */
export const SCHEMA_VERSION = 1;

interface PersistedEncounter {
  schemaVersion: number;
  encounter: Encounter;
}

interface PersistedParty {
  schemaVersion: number;
  players: Player[];
}

interface TrackerDB extends DBSchema {
  encounters: { key: string; value: PersistedEncounter };
  parties: { key: string; value: PersistedParty };
}

const DB_NAME = "pf2-combat-tracker";
const DB_VERSION = 1;
/** Both stores hold a single row each — there's only ever one encounter and
 * one party in flight, so a fixed key stands in for "the" saved state. */
const KEY = "current";

let dbPromise: Promise<IDBPDatabase<TrackerDB>> | null = null;

function getDb(): Promise<IDBPDatabase<TrackerDB>> {
  dbPromise ??= openDB<TrackerDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains("encounters")) db.createObjectStore("encounters");
      if (!db.objectStoreNames.contains("parties")) db.createObjectStore("parties");
    },
  });
  return dbPromise;
}

/** A payload saved before `initiativeModifier` existed on `Player`/
 * `Combatant` has neither field at all — not `null` — because it was never
 * written. `in` (not `??`) is what tells "predates this field" apart from a
 * value some future save deliberately set to `null`, even though both
 * currently resolve to the same default. */
function withInitiativeModifierDefault<T extends object>(entity: T): T {
  return "initiativeModifier" in entity ? entity : { ...entity, initiativeModifier: null };
}

/** Same idea for the two fields Delay added to `Entry` (see their doc
 * comments in types.ts). `delayed` missing would merely be falsy, but a
 * missing `initiativeBeforeDelay` is `undefined`, and the row's "did a
 * return rewrite this initiative?" test is `!== null` — so without this an
 * encounter saved before Delay existed would render a struck-through
 * "undefined" on every row. */
function withDelayDefaults<T extends object>(entry: T): T {
  return {
    ...("delayed" in entry ? {} : { delayed: false }),
    ...("initiativeBeforeDelay" in entry ? {} : { initiativeBeforeDelay: null }),
    ...entry,
  };
}

/**
 * Stamps a payload with the current schema version, upgrading a payload
 * that predates `schemaVersion` (version 0). Refuses a payload newer than
 * what this build understands, rather than silently truncating it —
 * opening an old save with a new client is fine; the reverse isn't.
 *
 * Also defaults a handful of fields that were added to `Player`,
 * `Combatant` and `Entry` without a `SCHEMA_VERSION` bump (see those types'
 * `initiativeModifier` and `delayed`/`initiativeBeforeDelay` doc comments) — a real shape change would earn its
 * own version and its own migration step here, but this is just a reader
 * filling in a field older data never had, so the version stays put.
 * Doing it once here, rather than at every call site that reads the field,
 * is what lets those call sites trust the `number | null` type as written.
 */
export function migrate(raw: unknown): Record<string, unknown> {
  const payload: Record<string, unknown> =
    raw !== null && typeof raw === "object" ? { ...(raw as Record<string, unknown>) } : {};
  const version = typeof payload.schemaVersion === "number" ? payload.schemaVersion : 0;
  if (version > SCHEMA_VERSION) {
    throw new Error(
      `Saved data is from a newer schema version (${version}) than this app supports (${SCHEMA_VERSION}).`,
    );
  }
  payload.schemaVersion = SCHEMA_VERSION;

  if (Array.isArray(payload.players)) {
    payload.players = (payload.players as object[]).map(withInitiativeModifierDefault);
  }

  const encounter = payload.encounter;
  if (encounter !== null && typeof encounter === "object") {
    let patched = encounter as Record<string, unknown>;
    const combatants = patched.combatants;
    if (combatants !== null && typeof combatants === "object") {
      const defaulted = Object.fromEntries(
        Object.entries(combatants as Record<string, object>).map(([id, c]) => [
          id,
          withInitiativeModifierDefault(c),
        ]),
      );
      patched = { ...patched, combatants: defaulted };
    }
    if (Array.isArray(patched.entries)) {
      patched = { ...patched, entries: (patched.entries as object[]).map(withDelayDefaults) };
    }
    payload.encounter = patched;
  }

  return payload;
}

export async function saveEncounter(state: Encounter): Promise<void> {
  const db = await getDb();
  await db.put("encounters", { schemaVersion: SCHEMA_VERSION, encounter: state }, KEY);
}

export async function loadEncounter(): Promise<Encounter | null> {
  const db = await getDb();
  const raw = await db.get("encounters", KEY);
  if (raw === undefined) return null;
  const migrated = migrate(raw) as unknown as PersistedEncounter;
  return migrated.encounter;
}

export async function savePlayers(players: Player[]): Promise<void> {
  const db = await getDb();
  await db.put("parties", { schemaVersion: SCHEMA_VERSION, players }, KEY);
}

export async function loadPlayers(): Promise<Player[]> {
  const db = await getDb();
  const raw = await db.get("parties", KEY);
  if (raw === undefined) return [];
  const migrated = migrate(raw) as unknown as PersistedParty;
  return migrated.players;
}
