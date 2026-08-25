import { beforeEach, describe, expect, it, vi } from "vitest";
import { migrate, SCHEMA_VERSION } from "../src/state/persist.js";

describe("migrate", () => {
  it("passes through current-version payloads unchanged", () => {
    const payload = { schemaVersion: SCHEMA_VERSION, encounter: { round: 3 } };
    expect(migrate(payload)).toEqual(payload);
  });

  it("upgrades a version-0 payload lacking schemaVersion", () => {
    const out = migrate({ encounter: { round: 2 } });
    expect(out.schemaVersion).toBe(SCHEMA_VERSION);
  });

  it("rejects a payload from a future version", () => {
    expect(() => migrate({ schemaVersion: SCHEMA_VERSION + 99 })).toThrow(/newer/i);
  });

  it("defaults a player's missing initiativeModifier to null, not undefined", () => {
    const payload = {
      schemaVersion: SCHEMA_VERSION,
      players: [{ id: "p1", name: "Valeria", level: 4, ac: 21, saves: { fortitude: 10, reflex: 12, will: 9 }, present: true }],
    };
    const out = migrate(payload) as { players: { initiativeModifier: unknown }[] };
    expect(out.players[0]!.initiativeModifier).toBeNull();
    expect(out.players[0]!.initiativeModifier).not.toBeUndefined();
  });

  it("leaves a player's already-set initiativeModifier alone", () => {
    const payload = {
      schemaVersion: SCHEMA_VERSION,
      players: [{ id: "p1", name: "Valeria", level: 4, ac: 21, saves: { fortitude: 10, reflex: 12, will: 9 }, present: true, initiativeModifier: 5 }],
    };
    const out = migrate(payload) as { players: { initiativeModifier: unknown }[] };
    expect(out.players[0]!.initiativeModifier).toBe(5);
  });

  // Delay's two Entry fields landed the same way initiativeModifier did:
  // added without a SCHEMA_VERSION bump, so an encounter saved before they
  // existed comes back with neither. `delayed: undefined` would at least be
  // falsy, but `initiativeBeforeDelay: undefined` is not `null`, and the row
  // renders the parked initiative on exactly that check — an old save would
  // have printed a struck-through "undefined" beside every combatant.
  it("defaults an entry's missing delay fields, so an encounter saved before Delay existed loads clean", () => {
    const payload = {
      schemaVersion: SCHEMA_VERSION,
      encounter: {
        round: 1,
        entries: [{ id: "e1", initiative: 17, combatantIds: ["c1"], groupName: null, trueInitiative: null }],
        combatants: {},
      },
    };
    const out = migrate(payload) as {
      encounter: {
        entries: { initiative: number; delayed: unknown; initiativeBeforeDelay: unknown; endOfTurnResolved: unknown }[];
      };
    };
    expect(out.encounter.entries[0]!.delayed).toBe(false);
    expect(out.encounter.entries[0]!.endOfTurnResolved).toBe(false);
    expect(out.encounter.entries[0]!.initiativeBeforeDelay).toBeNull();
    expect(out.encounter.entries[0]!.initiativeBeforeDelay).not.toBeUndefined();
    expect(out.encounter.entries[0]!.initiative).toBe(17); // nothing else touched
  });

  it("leaves an entry's existing delay state alone", () => {
    const payload = {
      schemaVersion: SCHEMA_VERSION,
      encounter: {
        round: 1,
        entries: [{ id: "e1", initiative: 12, combatantIds: ["c1"], delayed: true, initiativeBeforeDelay: 20 }],
        combatants: {},
      },
    };
    const out = migrate(payload) as {
      encounter: { entries: { delayed: unknown; initiativeBeforeDelay: unknown }[] };
    };
    expect(out.encounter.entries[0]!.delayed).toBe(true);
    expect(out.encounter.entries[0]!.initiativeBeforeDelay).toBe(20);
  });

  it("defaults a combatant's missing initiativeModifier to null, not undefined", () => {
    const payload = {
      schemaVersion: SCHEMA_VERSION,
      encounter: {
        round: 1,
        combatants: { c1: { id: "c1", kind: "creature", name: "Goblin" } },
      },
    };
    const out = migrate(payload) as { encounter: { combatants: Record<string, { initiativeModifier: unknown }> } };
    expect(out.encounter.combatants.c1!.initiativeModifier).toBeNull();
    expect(out.encounter.combatants.c1!.initiativeModifier).not.toBeUndefined();
  });
});
