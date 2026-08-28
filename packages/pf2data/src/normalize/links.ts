const PACK_ALIASES: Record<string, string> = {
  conditionitems: "conditions",
  "spells-srd": "spells",
  actionspf2e: "actions",
  "equipment-srd": "equipment",
};

const CONDITION_LABELS: Record<string, string> = {
  "flat-footed": "Off-Guard",
};

// Upstream writes both labelled and bare references. In the ENGLISH data the
// identifier is a human-readable name, possibly with hyphens, spaces, colons
// or apostrophes (`Item.Off-Guard`, `Item.Interplanar Teleport`), which is why
// a bare reference is safe to render as its identifier. Much of the FRENCH
// module uses a raw Foundry id there instead, so a bare French reference
// renders as that id -- two such cases survive today, both upstream typos
// where the label was written outside the braces.
//
// The document type is NOT always `Item`. Across the real dataset it is Item
// (11405), Actor (66), Macro (24) and JournalEntry (8) — the last of which
// nests a further `.JournalEntryPage.<id>` inside the identifier. Every one of
// those carries a usable label, so the greedy identifier is safe. The pre-V11
// three-segment form omits the type entirely, hence the optional group.
//
// The same reference is spelled four ways across the two sources. Only the
// current `@UUID[Compendium.pf2e.…]` form appears in the English upstream;
// the rest are the French module's, and leaving any unmatched puts raw
// bracket text in front of the GM. Measured across every consumed pack:
// 4206 current form, 6 three-segment, 1 with a stray space after
// `Compendium.`, 16 pre-V9 `@Compendium[…]`, 4 with no `@`-prefix at all.
// Widening costs English nothing: it has zero of the last three, proven by
// regenerating the whole dataset byte-identically.

/** `<pack>[.<DocType>].<identifier>]` plus an optional `{label}` — the tail
 * every spelling shares. Built once so the patterns cannot drift apart. */
const REFERENCE_TAIL = String.raw`([a-z0-9-]+)\.(?:([A-Za-z]+)\.)?([^\]]+)\](?:\{([^}]*)\})?`;

const REFERENCE_PATTERNS = [
  // Current syntax, and the only one the English upstream uses.
  new RegExp(String.raw`@UUID\[Compendium\.\s*pf2e\.` + REFERENCE_TAIL, "g"),
  // Pre-V9 syntax for the same reference.
  new RegExp(String.raw`@Compendium\[\s*pf2e\.` + REFERENCE_TAIL, "g"),
  // The `@`-prefix dropped altogether. The lookbehind keeps this from eating
  // the bracket of some other marker family (`@Template[...]`, `@Check[...]`)
  // or the second half of an already-matched reference.
  new RegExp(
    String.raw`(?<![A-Za-z\]])\[(?:Compendium\.\s*)?pf2e\.` + REFERENCE_TAIL,
    "g",
  ),
];

export interface LinkRef {
  pack: string;
  docType: string;
  id: string;
  label: string;
}

const remapLabel = (label: string): string =>
  CONDITION_LABELS[label.toLowerCase()] ?? label;

const displayOf = (identifier: string, label: string | undefined): string =>
  remapLabel(label !== undefined && label !== "" ? label : identifier);

export function resolveLinks(html: string): string {
  return REFERENCE_PATTERNS.reduce(
    (text, pattern) =>
      text.replace(
        pattern,
        (_match, _pack: string, _docType: string, identifier: string, label?: string) =>
          displayOf(identifier, label),
      ),
    html,
  );
}

export function collectLinks(html: string): LinkRef[] {
  const refs: LinkRef[] = [];
  for (const match of REFERENCE_PATTERNS.flatMap((p) => [...html.matchAll(p)])) {
    const rawPack = match[1] ?? "";
    const identifier = match[3] ?? "";
    refs.push({
      pack: PACK_ALIASES[rawPack] ?? rawPack,
      docType: match[2] ?? "Item",
      id: identifier,
      label: displayOf(identifier, match[4]),
    });
  }
  return refs;
}
