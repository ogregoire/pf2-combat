import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { collectLinks, resolveLinks } from "../src/normalize/links.js";

const load = (name: string) =>
  JSON.parse(
    readFileSync(
      fileURLToPath(new URL(`./fixtures/${name}.json`, import.meta.url)),
      "utf8",
    ),
  );

const html =
  "<p>The target is @UUID[Compendium.pf2e.conditionitems.Item.Off-Guard] " +
  "and must attempt @UUID[Compendium.pf2e.spells-srd.Item.Interplanar Teleport]{a save} " +
  "against @UUID[Compendium.pf2e.conditionitems.Item.Flat-Footed].</p>";

describe("resolveLinks", () => {
  it("renders a bare hyphenated reference as its identifier", () => {
    expect(resolveLinks(html)).toContain("Off-Guard");
  });

  it("renders a bare reference whose name contains a space", () => {
    expect(resolveLinks(html)).toContain("a save");
  });

  it("prefers a labelled reference's label over its identifier", () => {
    const result = resolveLinks(html);
    expect(result).toContain("a save");
    expect(result).not.toContain("Interplanar Teleport");
  });

  it("remaps a bare Item.Flat-Footed to Off-Guard", () => {
    const result = resolveLinks(html);
    expect(result).not.toContain("Flat-Footed");
  });

  it("leaves text without links untouched", () => {
    expect(resolveLinks("<p>plain</p>")).toBe("<p>plain</p>");
  });

  it("leaves no unresolved @UUID markup in a real fixture", () => {
    const raw = JSON.stringify(load("akiros-ismort"));
    expect(resolveLinks(raw)).not.toContain("@UUID[");
  });

  it("leaves no unresolved @UUID markup in another real fixture", () => {
    const raw = JSON.stringify(load("nyrissa"));
    expect(resolveLinks(raw)).not.toContain("@UUID[");
  });
});

describe("collectLinks", () => {
  it("applies legacy pack aliases on bare and labelled real forms", () => {
    const refs = collectLinks(html);
    expect(refs).toEqual([
      { pack: "conditions", id: "Off-Guard", label: "Off-Guard" },
      { pack: "spells", id: "Interplanar Teleport", label: "a save" },
      { pack: "conditions", id: "Flat-Footed", label: "Off-Guard" },
    ]);
  });
});
