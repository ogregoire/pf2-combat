import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import type { Condition, GlossaryEntry, Trait } from "@pf2/schema";
import { useTraitGlossary } from "../src/hooks/useTraitGlossary.js";
import type { FetchFn } from "../src/data/catalog.js";

const glossaryEntry = (over: Partial<GlossaryEntry>): GlossaryEntry => ({
  slug: "grab", name: "Grab", cost: "passive", traits: [], description: "<p>Grabs.</p>", ...over,
});

const conditionEntry = (over: Partial<Condition>): Condition => ({
  slug: "clumsy", name: "Clumsy", isValued: true, description: "<p>Clumsy things.</p>", ...over,
});

const traitEntry = (over: Partial<Trait>): Trait => ({
  slug: "agile", name: "Agile", description: "<p>Lowers the multiple attack penalty.</p>", ...over,
});

const fakeFetch = (traits: Trait[], glossary: GlossaryEntry[], conditions: Condition[]): FetchFn => (url) => {
  if (url.includes("traits.json")) return Promise.resolve(new Response(JSON.stringify(traits)));
  if (url.includes("glossary.json")) return Promise.resolve(new Response(JSON.stringify(glossary)));
  if (url.includes("conditions.json")) return Promise.resolve(new Response(JSON.stringify(conditions)));
  return Promise.reject(new Error(`unexpected fetch: ${url}`));
};

describe("useTraitGlossary", () => {
  it("starts empty, then merges trait, glossary and condition entries by slug", async () => {
    const fetchFn = fakeFetch([traitEntry({})], [glossaryEntry({})], [conditionEntry({})]);
    const { result } = renderHook(() => useTraitGlossary(fetchFn));

    expect(result.current.size).toBe(0);

    await waitFor(() => expect(result.current.size).toBe(3));
    expect(result.current.get("agile")).toEqual({
      name: "Agile",
      description: "<p>Lowers the multiple attack penalty.</p>",
    });
    expect(result.current.get("grab")).toEqual({ name: "Grab", description: "<p>Grabs.</p>" });
    expect(result.current.get("clumsy")).toEqual({ name: "Clumsy", description: "<p>Clumsy things.</p>" });
  });

  it("lets traits.json win over glossary.json/conditions.json on a slug collision", async () => {
    const fetchFn = fakeFetch(
      [traitEntry({ slug: "grab", name: "Grab (trait)", description: "from traits.json" })],
      [glossaryEntry({ slug: "grab", name: "Grab (glossary)", description: "from glossary.json" })],
      [],
    );
    const { result } = renderHook(() => useTraitGlossary(fetchFn));

    await waitFor(() => expect(result.current.size).toBe(1));
    expect(result.current.get("grab")).toEqual({ name: "Grab (trait)", description: "from traits.json" });
  });

  it("stays an empty map, not an error, when the fetch fails", async () => {
    const fetchFn: FetchFn = () => Promise.reject(new Error("network down"));
    const { result } = renderHook(() => useTraitGlossary(fetchFn));

    await new Promise((r) => setTimeout(r, 10));
    expect(result.current.size).toBe(0);
  });

  // Against the real regenerated data/traits.json — the user's own two
  // examples ("agile", "deadly d10") are exactly what was missing when
  // traits.json didn't exist yet (glossary.json/conditions.json have
  // nothing for either). This is what makes the fix verifiable rather than
  // merely plausible.
  it("resolves the user's own examples, agile and deadly-d10, from the real regenerated data", async () => {
    const traitsPath = resolve(process.cwd(), "data/traits.json");
    const traits = JSON.parse(readFileSync(traitsPath, "utf8")) as Trait[];
    const fetchFn = fakeFetch(traits, [], []);

    const { result } = renderHook(() => useTraitGlossary(fetchFn));
    await waitFor(() => expect(result.current.size).toBeGreaterThan(0));

    const { splitTraitValue } = await import("../src/rules/traitInfo.js");

    const agile = result.current.get(splitTraitValue("agile").base);
    expect(agile?.name).toBe("Agile");
    expect(agile?.description.length).toBeGreaterThan(0);

    const deadly = result.current.get(splitTraitValue("deadly-d10").base);
    expect(deadly?.name).toBe("Deadly");
    expect(deadly?.description.length).toBeGreaterThan(0);
  });
});
