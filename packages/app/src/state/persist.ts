import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { Lang } from "./store.js";
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

interface PersistedSettings {
  schemaVersion: number;
  lang: Lang;
}

interface TrackerDB extends DBSchema {
  encounters: { key: string; value: PersistedEncounter };
  parties: { key: string; value: PersistedParty };
  settings: { key: string; value: PersistedSettings };
}

const DB_NAME = "pf2-combat-tracker";
const DB_VERSION = 2;
/** Both stores hold a single row each — there's only ever one encounter and
 * one party in flight, so a fixed key stands in for "the" saved state. */
const KEY = "current";

/** A payload saved before `lang` existed carries no such field — an
 * existing saved fight must still open, in English. */
const DEFAULT_LANG: Lang = "en";

let dbPromise: Promise<IDBPDatabase<TrackerDB>> | null = null;

function getDb(): Promise<IDBPDatabase<TrackerDB>> {
  dbPromise ??= openDB<TrackerDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains("encounters")) db.createObjectStore("encounters");
      if (!db.objectStoreNames.contains("parties")) db.createObjectStore("parties");
      if (!db.objectStoreNames.contains("settings")) db.createObjectStore("settings");
    },
  });
  return dbPromise;
}

/**
 * Stamps a payload with the current schema version, upgrading a payload
 * that predates `schemaVersion` (version 0). Refuses a payload newer than
 * what this build understands, rather than silently truncating it —
 * opening an old save with a new client is fine; the reverse isn't.
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

export async function saveSettings(settings: { lang: Lang }): Promise<void> {
  const db = await getDb();
  await db.put("settings", { schemaVersion: SCHEMA_VERSION, lang: settings.lang }, KEY);
}

export async function loadSettings(): Promise<{ lang: Lang }> {
  const db = await getDb();
  const raw = await db.get("settings", KEY);
  if (raw === undefined) return { lang: DEFAULT_LANG };
  const migrated = migrate(raw) as unknown as PersistedSettings;
  return { lang: migrated.lang ?? DEFAULT_LANG };
}

/**
 * Test-only: writes a payload to the settings store exactly as given,
 * bypassing `saveSettings`'s schema stamping — used to simulate a payload
 * saved by a build that predates a given field (e.g. `lang`).
 */
export async function putRawSettings(raw: unknown): Promise<void> {
  const db = await getDb();
  await db.put("settings", raw as PersistedSettings, KEY);
}
