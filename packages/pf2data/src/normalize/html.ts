const HR_PATTERN = /<hr\s*\/?>/i;

const NAMED_ENTITIES: Record<string, string> = {
  "&nbsp;": " ",
  "&amp;": "&",
  "&mdash;": "—",
  "&ndash;": "–",
  "&rsquo;": "’",
  "&lsquo;": "‘",
  "&rdquo;": "”",
  "&ldquo;": "“",
  "&apos;": "'",
  "&quot;": '"',
  "&lt;": "<",
  "&gt;": ">",
};

const NAMED_ENTITY_PATTERN = new RegExp(
  Object.keys(NAMED_ENTITIES)
    .map((e) => e.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|"),
  "g",
);

const stripTags = (html: string): string =>
  html
    .replace(/<[^>]+>/g, "")
    .replace(NAMED_ENTITY_PATTERN, (entity) => NAMED_ENTITIES[entity] ?? entity)
    .replace(/\s+/g, " ")
    .trim();

function extractLabelled(html: string, label: string): string | null {
  // The trigger/requirements paragraph always precedes the <hr/> that
  // separates it from the ability's main description. Restricting the search
  // to before the first <hr/> avoids matching an unrelated later paragraph
  // that happens to also start with the same <strong> label.
  const boundary = HR_PATTERN.exec(html);
  const scope = boundary === null ? html : html.slice(0, boundary.index);

  const pattern = new RegExp(
    `<strong>\\s*${label}\\s*</strong>([\\s\\S]*?)</p>`,
    "i",
  );
  const match = pattern.exec(scope);
  if (match === null) return null;
  const text = stripTags(match[1] ?? "");
  return text === "" ? null : text;
}

export function extractTrigger(html: string): string | null {
  return extractLabelled(html, "Trigger");
}

export function extractRequirements(html: string): string | null {
  return extractLabelled(html, "Requirements");
}

export function extractTriggerFr(html: string): string | null {
  return extractLabelled(html, "Déclencheur");
}

/**
 * French "Conditions" is the label the module uses for the English
 * "Requirements" paragraph (a prerequisite to using the ability) -- it is
 * NOT the status-effect sense of "conditions" (frightened, prone, etc.).
 * Do not repoint this at the condition glossary.
 */
export function extractRequirementsFr(html: string): string | null {
  return extractLabelled(html, "Conditions");
}
