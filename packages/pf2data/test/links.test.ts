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

/**
 * The French Babele module carries older and typo'd spellings of the same
 * marker. The English upstream has none of these (checked across all consumed
 * packs), so widening the pattern is a no-op there and the only alternative
 * would be a second, French-only copy of it.
 */
describe("resolveLinks tolerates the module's legacy and typo'd UUID spellings", () => {
  it("resolves the pre-V11 three-segment form, which omits the document type", () => {
    // `Compendium.pf2e.conditionitems.<id>` -- no `.Item.` segment. Six real
    // occurrences in the French module, all carrying a French label.
    expect(
      resolveLinks("<p>est @UUID[Compendium.pf2e.conditionitems.xYTAsEpcJE1Ccni3]{Ralentie 1}.</p>"),
    ).toBe("<p>est Ralentie 1.</p>");
  });

  it("falls back to the identifier for an unlabelled three-segment form", () => {
    expect(resolveLinks("@UUID[Compendium.pf2e.actionspf2e.Balance]")).toBe("Balance");
  });

  it("tolerates a stray space after Compendium.", () => {
    // One real occurrence: pathfinder-monster-core / Xulgath Skulker.
    expect(
      resolveLinks("@UUID[Compendium. pf2e.conditionitems.Item.AJh5ex99aV6VTggg]{Prise au dépourvu}"),
    ).toBe("Prise au dépourvu");
  });

  it("still reads the four-segment form the same way", () => {
    expect(resolveLinks("@UUID[Compendium.pf2e.spells-srd.Item.Prestidigitation]")).toBe(
      "Prestidigitation",
    );
    expect(collectLinks("@UUID[Compendium.pf2e.spells-srd.Item.Prestidigitation]")).toEqual([
      { pack: "spells", docType: "Item", id: "Prestidigitation", label: "Prestidigitation" },
    ]);
  });

  it("defaults the document type to Item for the three-segment form", () => {
    expect(collectLinks("@UUID[Compendium.pf2e.conditionitems.xYTAsEpcJE1Ccni3]{Ralentie 1}")).toEqual([
      { pack: "conditions", docType: "Item", id: "xYTAsEpcJE1Ccni3", label: "Ralentie 1" },
    ]);
  });
});

describe("resolveLinks handles the pre-V9 @Compendium syntax", () => {
  // 16 real occurrences in the French module, all in the `Coven` ability, and
  // ZERO anywhere in the English upstream -- so this too costs English nothing.
  it("resolves a labelled @Compendium reference to its label", () => {
    expect(
      resolveLinks("<p>@Compendium[pf2e.spells-srd.dN8QBNuTiaBHCKUe]{Métamorphose maudite}</p>"),
    ).toBe("<p>Métamorphose maudite</p>");
  });

  it("collects it with the same shape as a @UUID reference", () => {
    expect(
      collectLinks("@Compendium[pf2e.spells-srd.dN8QBNuTiaBHCKUe]{Métamorphose maudite}"),
    ).toEqual([
      { pack: "spells", docType: "Item", id: "dN8QBNuTiaBHCKUe", label: "Métamorphose maudite" },
    ]);
  });
});

describe("resolveLinks handles a reference whose @-prefix is missing", () => {
  // Four real occurrences in the French module, zero in the English upstream:
  // the translator dropped the `@UUID` / `@Compendium` prefix and left the
  // bracket text, which renders as literal `[Compendium.pf2e…]{Label}`.
  it("resolves [Compendium.pf2e.<pack>.<Doc>.<id>]{label}", () => {
    expect(
      resolveLinks("elle devient [Compendium.pf2e.conditionitems.Item.fesd1n5eVhpCSS18]{Nauséeuse 4}."),
    ).toBe("elle devient Nauséeuse 4.");
  });

  it("resolves [Compendium.pf2e.<pack>.<id>]{label}", () => {
    expect(
      resolveLinks("attitude [Compendium.pf2e.conditionitems.fuG8dgthlDWfWjIA]{Indifférente} envers"),
    ).toBe("attitude Indifférente envers");
  });

  it("resolves [pf2e.<pack>.<id>]{label}", () => {
    expect(resolveLinks("elle est [pf2e.conditionitems.4D2KBtexWXa6oUMR]{Drainée 1} en plus")).toBe(
      "elle est Drainée 1 en plus",
    );
  });

  it("does not eat the bracket of some other marker family", () => {
    // `@Template[emanation|distance:500]` must survive untouched -- the
    // English dataset carries 681 of them.
    expect(resolveLinks("@Template[emanation|distance:500]{Aura}")).toBe(
      "@Template[emanation|distance:500]{Aura}",
    );
  });
});
