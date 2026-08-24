import { readFileSync } from "node:fs";

export type LangTable = Record<string, string>;

const LOCALIZE_PATTERN = /@Localize\[([A-Za-z0-9._-]+)\]/g;

export function resolveLocalize(html: string, lang: LangTable): string {
  return html.replace(LOCALIZE_PATTERN, (match, key: string) =>
    lang[key] ?? match,
  );
}

/** Flattens PF2E.NPC.Abilities.Glossary.* into dotted keys. */
export function loadGlossaryLang(langFilePath: string): LangTable {
  const root: unknown = JSON.parse(readFileSync(langFilePath, "utf8"));
  const table: LangTable = {};

  const walk = (node: unknown, path: string): void => {
    if (typeof node === "string") {
      table[path] = node;
      return;
    }
    if (node === null || typeof node !== "object") return;
    for (const [key, child] of Object.entries(node)) {
      walk(child, path === "" ? key : `${path}.${key}`);
    }
  };

  walk(root, "");
  return table;
}
