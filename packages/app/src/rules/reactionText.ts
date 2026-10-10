/** A reaction's rules text minus its opening Trigger paragraph (and the
 * rule under it), which the card already shows on its own line — in either
 * language ("Trigger"/"Déclencheur"). Empty when nothing else is left. */
export function withoutTrigger(html: string): string {
  return html
    .replace(/^\s*<p>\s*<strong>\s*(Trigger|Déclencheur)\s*<\/strong>[\s\S]*?<\/p>\s*(<hr\s*\/?>)?\s*/i, "")
    .trim();
}
