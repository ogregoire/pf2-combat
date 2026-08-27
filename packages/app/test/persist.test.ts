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
        entries: {
          initiative: number;
          delayed: unknown;
          initiativeBeforeDelay: unknown;
          endOfTurnResolvedRound: unknown;
        }[];
      };
    };
    expect(out.encounter.entries[0]!.delayed).toBe(false);
    // Never resolved, not "resolved in round 0" — the stamp is compared
    // against a live round number, and round 0 does not exist.
    expect(out.encounter.entries[0]!.endOfTurnResolvedRound).toBeNull();
    expect(out.encounter.entries[0]!.endOfTurnResolvedRound).not.toBeUndefined();
    expect(out.encounter.entries[0]!.initiativeBeforeDelay).toBeNull();
    expect(out.encounter.entries[0]!.initiativeBeforeDelay).not.toBeUndefined();
    expect(out.encounter.entries[0]!.initiative).toBe(17); // nothing else touched
  });

  it("leaves an entry's existing delay state alone", () => {
    const payload = {
      schemaVersion: SCHEMA_VERSION,
      encounter: {
        round: 1,
        entries: [{
          id: "e1", initiative: 12, combatantIds: ["c1"], delayed: true,
          initiativeBeforeDelay: 20, endOfTurnResolvedRound: 3,
        }],
        combatants: {},
      },
    };
    const out = migrate(payload) as {
      encounter: { entries: { delayed: unknown; initiativeBeforeDelay: unknown; endOfTurnResolvedRound: unknown }[] };
    };
    expect(out.encounter.entries[0]!.delayed).toBe(true);
    expect(out.encounter.entries[0]!.initiativeBeforeDelay).toBe(20);
    // A saved mid-fight Delay keeps the round it was resolved in, or
    // reloading would let that combatant resolve the same turn twice.
    expect(out.encounter.entries[0]!.endOfTurnResolvedRound).toBe(3);
  });

  // `orderKey` is the sort key the whole turn order is built on, and it
  // arrived on `Entry` the same way the fields above did: no
  // SCHEMA_VERSION bump, so an encounter saved before it existed comes back
  // without one. `Entry.orderKey: number` promises otherwise, and the
  // sorter's own `?? 0` fallback would then tie every single entry at 0 and
  // scramble a returning GM's fight. Defaulting here, at the one boundary
  // stored data crosses, is what lets `orderKey: number` be true.
  it("defaults an entry's missing orderKey from its own initiative, so an old save keeps its order", () => {
    const payload = {
      schemaVersion: SCHEMA_VERSION,
      encounter: {
        round: 1,
        entries: [
          { id: "e1", initiative: 21, combatantIds: ["c1"], groupName: null, trueInitiative: null },
          { id: "e2", initiative: 9, combatantIds: ["c2"], groupName: null, trueInitiative: null },
        ],
        combatants: {},
      },
    };
    const out = migrate(payload) as { encounter: { entries: { orderKey: unknown }[] } };
    expect(out.encounter.entries[0]!.orderKey).toBe(21);
    expect(out.encounter.entries[1]!.orderKey).toBe(9);
  });

  // Matches what the store itself writes for a combatant added with no roll
  // (`orderKey: initiative ?? 0`): an unrolled entry sorts above everything
  // on `initiative === null` alone, so its key is never consulted — but it
  // still has to be a number rather than null, per the type.
  it("defaults an unrolled entry's orderKey to 0, exactly as the store does when creating one", () => {
    const payload = {
      schemaVersion: SCHEMA_VERSION,
      encounter: {
        round: 1,
        entries: [{ id: "e1", initiative: null, combatantIds: ["c1"], groupName: null, trueInitiative: null }],
        combatants: {},
      },
    };
    const out = migrate(payload) as { encounter: { entries: { orderKey: unknown }[] } };
    expect(out.encounter.entries[0]!.orderKey).toBe(0);
  });

  // A saved orderKey is routinely *not* the initiative — that is the entire
  // point of the field (a Delay return or a drag places an entry between two
  // neighbours). Defaulting over one would silently undo every such
  // placement the GM made before closing the app.
  it("leaves an entry's existing orderKey alone, including a fractional one from a drag or a Delay return", () => {
    const payload = {
      schemaVersion: SCHEMA_VERSION,
      encounter: {
        round: 1,
        entries: [{ id: "e1", initiative: 17, orderKey: 12.5, combatantIds: ["c1"], groupName: null, trueInitiative: null }],
        combatants: {},
      },
    };
    const out = migrate(payload) as { encounter: { entries: { orderKey: unknown }[] } };
    expect(out.encounter.entries[0]!.orderKey).toBe(12.5);
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
