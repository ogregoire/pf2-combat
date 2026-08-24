import { describe, expect, it } from "vitest";
import { collectLinks, resolveLinks } from "../src/normalize/links.js";

const html =
  "<p>The target is @UUID[Compendium.pf2e.conditionitems.Item.AJh5ex99aV6VTggg]{Flat-Footed} " +
  "and takes @UUID[Compendium.pf2e.spells-srd.Item.abc123]{Fireball} damage.</p>";

describe("resolveLinks", () => {
  it("replaces uuid links with their label", () => {
    expect(resolveLinks(html)).toBe(
      "<p>The target is Off-Guard and takes Fireball damage.</p>",
    );
  });

  it("remaps legacy condition labels", () => {
    expect(resolveLinks(html)).not.toContain("Flat-Footed");
  });

  it("leaves text without links untouched", () => {
    expect(resolveLinks("<p>plain</p>")).toBe("<p>plain</p>");
  });
});

describe("collectLinks", () => {
  it("applies legacy pack aliases", () => {
    const refs = collectLinks(html);
    expect(refs).toEqual([
      { pack: "conditions", id: "AJh5ex99aV6VTggg", label: "Off-Guard" },
      { pack: "spells", id: "abc123", label: "Fireball" },
    ]);
  });
});
