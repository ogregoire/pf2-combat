import { beforeEach, describe, expect, it } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import type { CreatureI18n } from "@pf2/schema";
import { useCombatantI18n, __resetCombatantI18nCacheForTests } from "../src/hooks/useCombatantI18n.js";
import { useEncounter } from "../src/state/store.js";

const overlay: CreatureI18n = {
  name: "Troll des forêts",
  publicNotes: null,
  actions: [],
  attacks: [],
};

// Each test below uses its OWN creatureId, deliberately never reused across
// tests: the cache is keyed by id, so two tests sharing one would let an
// earlier test's resolved fetch answer a later test's call without ever
// invoking that later test's own fetchFn -- silently, since both would
// resolve to the same `overlay` value. `__resetCombatantI18nCacheForTests`
// below closes the same gap defensively, but distinct ids mean no single
// test's correctness depends on that reset actually running.
describe("useCombatantI18n", () => {
  beforeEach(() => {
    useEncounter.getState().reset();
    __resetCombatantI18nCacheForTests();
  });

  it("does not fetch when lang is \"en\", even with a creatureId and no i18n", () => {
    useEncounter.getState().setLang("en");
    let calls = 0;
    const fetchFn = async (): Promise<CreatureI18n | null> => {
      calls += 1;
      return overlay;
    };
    const { result } = renderHook(() =>
      useCombatantI18n({ i18n: null, creatureId: "pack/lang-en" }, fetchFn),
    );

    expect(result.current).toBeNull();
    expect(calls).toBe(0);
  });

  it("returns combatant.i18n unchanged, without fetching, when it's already populated", () => {
    useEncounter.getState().setLang("fr");
    let calls = 0;
    const fetchFn = async (): Promise<CreatureI18n | null> => {
      calls += 1;
      return overlay;
    };
    const { result } = renderHook(() =>
      useCombatantI18n({ i18n: overlay, creatureId: "pack/already-populated" }, fetchFn),
    );

    expect(result.current).toBe(overlay);
    expect(calls).toBe(0);
  });

  it("fetches by creatureId when lang is \"fr\" and i18n is null", async () => {
    useEncounter.getState().setLang("fr");
    const fetchFn = async (id: string): Promise<CreatureI18n | null> => {
      expect(id).toBe("pack/needs-fetch");
      return overlay;
    };
    const { result } = renderHook(() =>
      useCombatantI18n({ i18n: null, creatureId: "pack/needs-fetch" }, fetchFn),
    );

    expect(result.current).toBeNull();
    await waitFor(() => expect(result.current).toEqual(overlay));
  });

  it("treats an ABSENT i18n key the same as an explicit null (== null, not === null)", async () => {
    useEncounter.getState().setLang("fr");
    const combatant = { creatureId: "pack/absent-key" } as { i18n: CreatureI18n | null; creatureId: string };
    expect("i18n" in combatant).toBe(false);
    let calls = 0;
    const fetchFn = async (): Promise<CreatureI18n | null> => {
      calls += 1;
      return overlay;
    };

    const { result } = renderHook(() => useCombatantI18n(combatant, fetchFn));

    await waitFor(() => expect(result.current).toEqual(overlay));
    expect(calls).toBe(1);
  });

  it("shares one fetch across multiple hook instances for the same creatureId", async () => {
    useEncounter.getState().setLang("fr");
    let calls = 0;
    const fetchFn = async (): Promise<CreatureI18n | null> => {
      calls += 1;
      return overlay;
    };

    const a = renderHook(() => useCombatantI18n({ i18n: null, creatureId: "pack/shared" }, fetchFn));
    const b = renderHook(() => useCombatantI18n({ i18n: null, creatureId: "pack/shared" }, fetchFn));

    await waitFor(() => expect(a.result.current).toEqual(overlay));
    await waitFor(() => expect(b.result.current).toEqual(overlay));
    expect(calls).toBe(1);
  });

  // The bug the re-review found: `.catch(() => null)` on the cached promise
  // meant a genuinely failed fetch (a thrown error, not a real 404 resolving
  // to `null`) was cached as `null` forever -- a transient network problem
  // would leave a creature stuck in English for the rest of the session.
  it("does not cache a failed fetch — a later attempt for the same creatureId retries instead of reusing the failure", async () => {
    useEncounter.getState().setLang("fr");
    const failingFetch = async (): Promise<CreatureI18n | null> => {
      throw new Error("network down");
    };
    const first = renderHook(() =>
      useCombatantI18n({ i18n: null, creatureId: "pack/flaky" }, failingFetch),
    );

    // Falls back to English for this render — no unhandled rejection, no
    // permanent English lock-in.
    await new Promise((r) => setTimeout(r, 10));
    expect(first.result.current).toBeNull();
    first.unmount();

    const succeedingFetch = async (): Promise<CreatureI18n | null> => overlay;
    const second = renderHook(() =>
      useCombatantI18n({ i18n: null, creatureId: "pack/flaky" }, succeedingFetch),
    );

    await waitFor(() => expect(second.result.current).toEqual(overlay));
  });
});
