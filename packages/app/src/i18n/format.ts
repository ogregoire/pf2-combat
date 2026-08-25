/** Substitutes `{token}` placeholders in a catalogue string with `vars`.
 * Named rather than positional so a French translation can reorder words
 * around the substitution freely. An unmatched token is left as-is rather
 * than silently dropped, so a typo'd token name fails loudly in the UI.
 *
 * Split out from `index.ts` (which re-exports it unchanged) so pure code —
 * `rules/prompts.ts` builds its start/end-of-turn notification text with it
 * — can import it without pulling in `index.ts`'s `useT`, which depends on
 * the store. */
export function format(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (whole, key: string) => (key in vars ? String(vars[key]) : whole));
}
