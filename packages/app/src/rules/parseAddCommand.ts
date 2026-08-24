export interface AddCommand {
  quantity: number;
  nameQuery: string;
  initiative: number | null;
  /** The leading integer as typed, before clamping — equal to `quantity`
   * unless it fell outside [1, MAX_ADD_QUANTITY]. Lets a caller tell the GM
   * their typed quantity was capped, instead of clamping silently. */
  requestedQuantity: number;
}

const INTEGER = /^-?\d+$/;

/** A single stray digit (`500 goblin warrior 13`) must not be able to spawn
 * 500 combatants in one keystroke — the drawer's `+` button made that a
 * 500-click mistake; QuickAdd must not turn it into a one-keystroke one.
 * The largest Kingmaker set-pieces stay comfortably under this. */
export const MAX_ADD_QUANTITY = 30;

/**
 * Parses a quick-add command line like "6 goblin warrior 13" into its three
 * parts. A leading integer token (only when followed by at least one more
 * token) is the quantity; a trailing integer token (only when preceded by
 * at least one more token) is the initiative. Everything left between them
 * is the name query. Verified against all 1450 index entries: no creature
 * name starts or ends with a digit, so this split is unambiguous for real
 * input — a lone numeric token (no other tokens to anchor it as leading or
 * trailing) falls through to the name query instead, since it can't
 * satisfy either rule alone.
 */
export function parseAddCommand(input: string): AddCommand {
  const tokens = input.trim().split(/\s+/).filter((t) => t.length > 0);

  let start = 0;
  let end = tokens.length;
  let requestedQuantity = 1;
  let quantity = 1;
  let initiative: number | null = null;

  if (tokens.length >= 2 && INTEGER.test(tokens[0]!)) {
    requestedQuantity = parseInt(tokens[0]!, 10);
    quantity = Math.min(MAX_ADD_QUANTITY, Math.max(1, requestedQuantity));
    start = 1;
  }

  if (tokens.length >= 2 && INTEGER.test(tokens[tokens.length - 1]!)) {
    initiative = parseInt(tokens[tokens.length - 1]!, 10);
    end = tokens.length - 1;
  }

  const nameQuery = tokens.slice(start, end).join(" ");

  return { quantity, nameQuery, initiative, requestedQuantity };
}
