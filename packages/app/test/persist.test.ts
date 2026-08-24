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
});
