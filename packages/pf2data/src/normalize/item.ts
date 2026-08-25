/**
 * Shared by `normalizeActions` and `normalizeAttacks`, which both scan a
 * creature's whole `items` array and keep only the type they own.
 *
 * Both used to `safeParse` + `continue`, which conflated two very different
 * situations: an item of ANOTHER type (expected — every creature carries
 * spells, gear and Strikes alongside its actions) and an item of the RIGHT
 * type that fails validation (upstream drift). Silently skipping the second
 * deletes an ability or a Strike from the creature with no error and no
 * report line, because a dropped array element never reaches
 * `normalizePacks`'s `.failures` — that only collects THROWN errors.
 */
export function itemHasType(item: unknown, type: string): boolean {
  return (
    item !== null &&
    typeof item === "object" &&
    (item as { type?: unknown }).type === type
  );
}

/** A human handle for an item that failed validation: its name if it has one,
 * otherwise its `_id`, otherwise a placeholder. */
export function describeItem(item: unknown): string {
  const raw = item as { name?: unknown; _id?: unknown } | null;
  if (raw !== null && typeof raw === "object") {
    if (typeof raw.name === "string" && raw.name !== "") return `"${raw.name}"`;
    if (typeof raw._id === "string" && raw._id !== "") return `_id ${raw._id}`;
  }
  return "<unnamed>";
}
