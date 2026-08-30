import { compareStrings } from "./util.js";

export interface DatasetDiff {
  added: string[];
  removed: string[];
  modified: string[];
}

export type ChangeStatus = "unchanged" | "updated";

export function diffDataset(
  previous: Map<string, string>,
  next: Map<string, string>,
): DatasetDiff {
  const added: string[] = [];
  const removed: string[] = [];
  const modified: string[] = [];

  for (const [id, content] of next) {
    const before = previous.get(id);
    if (before === undefined) added.push(id);
    else if (before !== content) modified.push(id);
  }
  for (const id of previous.keys()) {
    if (!next.has(id)) removed.push(id);
  }

  const sort = (xs: string[]): string[] => xs.sort(compareStrings);
  return { added: sort(added), removed: sort(removed), modified: sort(modified) };
}

export function statusOf(diff: DatasetDiff): ChangeStatus {
  const total =
    diff.added.length + diff.removed.length + diff.modified.length;
  return total === 0 ? "unchanged" : "updated";
}

export interface FrenchCoverage {
  translated: number;
  total: number;
  /** The ids with no French overlay, `compareStrings`-sorted. */
  untranslated: string[];
}

/**
 * French coverage for `update`'s report: how many creatures carry an overlay,
 * and WHICH ones do not. The list is as important as the count -- before
 * Task 17 filled the gap from the module's retired `archive/`, 30 creatures
 * had no French entry at all (20 of them the `Petitioner (Plane)` series),
 * and a coverage drop that only showed up as a smaller number would not say
 * which creature stopped being translated.
 */
export function frenchCoverage(
  ids: string[],
  translated: ReadonlySet<string>,
): FrenchCoverage {
  const untranslated = ids.filter((id) => !translated.has(id)).sort(compareStrings);
  return {
    translated: ids.length - untranslated.length,
    total: ids.length,
    untranslated,
  };
}

export interface FieldCoverage {
  translated: number;
  total: number;
}

/**
 * Task 2: item-level coverage for one field (action name or description)
 * across every creature's overlay. Unlike `frenchCoverage`, no id list --
 * there are thousands of individual action entries (2045 null descriptions
 * alone before Task 2), far too many to usefully name on every run. The
 * creature-level list above is what points at a specific regression; this
 * is what shows the archive fallback's effect on the count.
 */
export function fieldCoverage(values: (string | null)[]): FieldCoverage {
  const translated = values.filter((value) => value !== null).length;
  return { translated, total: values.length };
}
