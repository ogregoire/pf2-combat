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
