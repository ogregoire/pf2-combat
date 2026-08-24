const stripTags = (html: string): string =>
  html
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();

function extractLabelled(html: string, label: string): string | null {
  const pattern = new RegExp(
    `<strong>\\s*${label}\\s*</strong>([\\s\\S]*?)</p>`,
    "i",
  );
  const match = pattern.exec(html);
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
