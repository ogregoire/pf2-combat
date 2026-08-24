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
      { pack: "conditions", docType: "Item", id: "Off-Guard", label: "Off-Guard" },
      { pack: "spells", docType: "Item", id: "Interplanar Teleport", label: "a save" },
      { pack: "conditions", docType: "Item", id: "Flat-Footed", label: "Off-Guard" },
    ]);
  });
});

describe("document types other than Item", () => {
  const actorHtml =
    "@UUID[Compendium.pf2e.pathfinder-monster-core.Actor.Wight]{Spawned Wight}";
  const macroHtml =
    "@UUID[Compendium.pf2e.action-macros.Macro.Impersonate: Deception]{Impersonate}";
  const journalHtml =
    "@UUID[Compendium.pf2e.journals.JournalEntry.abc123.JournalEntryPage.def456]{Kingmaker Chronicle}";

  it("resolves an Actor reference to its label", () => {
    expect(resolveLinks(actorHtml)).toBe("Spawned Wight");
  });

  it("resolves a Macro reference whose identifier contains a colon", () => {
    expect(resolveLinks(macroHtml)).toBe("Impersonate");
  });

  it("resolves a JournalEntry reference nesting a JournalEntryPage", () => {
    expect(resolveLinks(journalHtml)).toBe("Kingmaker Chronicle");
  });

  it("reports the correct docType for each", () => {
    expect(collectLinks(actorHtml)).toEqual([
      { pack: "pathfinder-monster-core", docType: "Actor", id: "Wight", label: "Spawned Wight" },
    ]);
    expect(collectLinks(macroHtml)).toEqual([
      {
        pack: "action-macros",
        docType: "Macro",
        id: "Impersonate: Deception",
        label: "Impersonate",
      },
    ]);
    expect(collectLinks(journalHtml)).toEqual([
      {
        pack: "journals",
        docType: "JournalEntry",
        id: "abc123.JournalEntryPage.def456",
        label: "Kingmaker Chronicle",
      },
    ]);
  });
});
