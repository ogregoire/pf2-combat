const PACK_ALIASES: Record<string, string> = {
  conditionitems: "conditions",
  "spells-srd": "spells",
  actionspf2e: "actions",
  "equipment-srd": "equipment",
};

const CONDITION_LABELS: Record<string, string> = {
  "flat-footed": "Off-Guard",
};

// Upstream writes both labelled and bare references, and the identifier is a
// human-readable name that may contain hyphens, spaces, colons and apostrophes
// (`Item.Off-Guard`, `Item.Interplanar Teleport`). A bare reference renders as
// its identifier, which is why the name form is safe to display.
//
// The document type is NOT always `Item`. Across the real dataset it is Item
// (11405), Actor (66), Macro (24) and JournalEntry (8) — the last of which
// nests a further `.JournalEntryPage.<id>` inside the identifier. Every one of
// those carries a usable label, so the greedy identifier is safe.
const UUID_PATTERN =
  /@UUID\[Compendium\.pf2e\.([a-z0-9-]+)\.([A-Za-z]+)\.([^\]]+)\](?:\{([^}]*)\})?/g;

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
  return html.replace(
    UUID_PATTERN,
    (_match, _pack: string, _docType: string, identifier: string, label?: string) =>
      displayOf(identifier, label),
  );
}

export function collectLinks(html: string): LinkRef[] {
  const refs: LinkRef[] = [];
  for (const match of html.matchAll(UUID_PATTERN)) {
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
