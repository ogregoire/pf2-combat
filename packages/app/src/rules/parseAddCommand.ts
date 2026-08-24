export interface AddCommand {
  quantity: number;
  nameQuery: string;
  initiative: number | null;
}

const INTEGER = /^-?\d+$/;

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
  let quantity = 1;
  let initiative: number | null = null;

  if (tokens.length >= 2 && INTEGER.test(tokens[0]!)) {
    quantity = Math.max(1, parseInt(tokens[0]!, 10));
    start = 1;
  }

  if (tokens.length >= 2 && INTEGER.test(tokens[tokens.length - 1]!)) {
    initiative = parseInt(tokens[tokens.length - 1]!, 10);
    end = tokens.length - 1;
  }

  const nameQuery = tokens.slice(start, end).join(" ");

  return { quantity, nameQuery, initiative };
}
