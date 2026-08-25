import { describe, expect, it } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import type { Condition, GlossaryEntry } from "@pf2/schema";
import { useTraitGlossary } from "../src/hooks/useTraitGlossary.js";
import type { FetchFn } from "../src/data/catalog.js";

const glossaryEntry = (over: Partial<GlossaryEntry>): GlossaryEntry => ({
  slug: "grab", name: "Grab", cost: "passive", traits: [], description: "<p>Grabs.</p>", ...over,
});

const conditionEntry = (over: Partial<Condition>): Condition => ({
  slug: "clumsy", name: "Clumsy", isValued: true, description: "<p>Clumsy things.</p>", ...over,
});

const fakeFetch = (glossary: GlossaryEntry[], conditions: Condition[]): FetchFn => (url) => {
  if (url.includes("glossary.json")) return Promise.resolve(new Response(JSON.stringify(glossary)));
  if (url.includes("conditions.json")) return Promise.resolve(new Response(JSON.stringify(conditions)));
  return Promise.reject(new Error(`unexpected fetch: ${url}`));
};

describe("useTraitGlossary", () => {
  it("starts empty, then merges glossary and condition entries by slug", async () => {
    const fetchFn = fakeFetch([glossaryEntry({})], [conditionEntry({})]);
    const { result } = renderHook(() => useTraitGlossary(fetchFn));

    expect(result.current.size).toBe(0);

    await waitFor(() => expect(result.current.size).toBe(2));
    expect(result.current.get("grab")).toEqual({ name: "Grab", description: "<p>Grabs.</p>" });
    expect(result.current.get("clumsy")).toEqual({ name: "Clumsy", description: "<p>Clumsy things.</p>" });
  });

  it("stays an empty map, not an error, when the fetch fails", async () => {
    const fetchFn: FetchFn = () => Promise.reject(new Error("network down"));
    const { result } = renderHook(() => useTraitGlossary(fetchFn));

    await new Promise((r) => setTimeout(r, 10));
    expect(result.current.size).toBe(0);
  });
});
