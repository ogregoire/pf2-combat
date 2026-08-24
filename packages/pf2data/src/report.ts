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
