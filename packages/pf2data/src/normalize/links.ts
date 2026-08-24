const PACK_ALIASES: Record<string, string> = {
  conditionitems: "conditions",
  "spells-srd": "spells",
  actionspf2e: "actions",
  "equipment-srd": "equipment",
};

const CONDITION_LABELS: Record<string, string> = {
  "flat-footed": "Off-Guard",
};

const UUID_PATTERN =
  /@UUID\[Compendium\.pf2e\.([a-z0-9-]+)\.Item\.([A-Za-z0-9]+)\]\{([^}]*)\}/g;

export interface LinkRef {
  pack: string;
  id: string;
  label: string;
}

const remapLabel = (label: string): string =>
  CONDITION_LABELS[label.toLowerCase()] ?? label;

export function resolveLinks(html: string): string {
  return html.replace(UUID_PATTERN, (_match, _pack, _id, label: string) =>
    remapLabel(label),
  );
}

export function collectLinks(html: string): LinkRef[] {
  const refs: LinkRef[] = [];
  for (const match of html.matchAll(UUID_PATTERN)) {
    const rawPack = match[1] ?? "";
    refs.push({
      pack: PACK_ALIASES[rawPack] ?? rawPack,
      id: match[2] ?? "",
      label: remapLabel(match[3] ?? ""),
    });
  }
  return refs;
}
