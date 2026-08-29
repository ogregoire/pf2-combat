import type { Action, Attack } from "@pf2/schema";
import { compareLocalized } from "./compare.js";

export type ActionListItem =
  | { kind: "action"; action: Action; children: Action[] }
  | { kind: "strike"; attack: Attack; index: number; children: Action[] };

/** 3 actions -> 2 -> 1 -> free -> reaction -> passive: the 3-action abilities
 * are the most impressive, so they lead. A Strike is always a 1-action
 * activity, ranked alongside cost-"1" actions. */
const COST_RANK: Record<Action["cost"], number> = {
  "3": 0,
  "2": 1,
  "1": 2,
  free: 3,
  reaction: 4,
  passive: 5,
};

function itemCost(item: ActionListItem): Action["cost"] {
  return item.kind === "strike" ? "1" : item.action.cost;
}

function itemLimited(item: ActionListItem): boolean {
  return item.kind === "strike" ? false : item.action.frequency !== null;
}

function itemName(item: ActionListItem): string {
  return item.kind === "strike" ? item.attack.name : item.action.name;
}

/** Limited-use (a `frequency`) first, then by cost descending, then name.
 * The name compare is deliberately the *last* tie-break, reached only once
 * limited-use and cost are equal — it never overrides the precedence above
 * it, so a 2-action ability still outranks a 1-action one regardless of
 * name. `compareLocalized`, not `compareStrings`: this list is rendered,
 * never persisted, so `compareStrings`'s cross-machine determinism concern
 * doesn't apply here, and a raw compare would file an accented French name
 * (e.g. "Épée") after every unaccented one instead of with its own letter —
 * the same bug the condition picker had (see RowPopover). Applies equally
 * to a Strike's name (via `itemName`), not just an action's. */
function compareItems(a: ActionListItem, b: ActionListItem, lang: string): number {
  const aLimited = itemLimited(a) ? 0 : 1;
  const bLimited = itemLimited(b) ? 0 : 1;
  if (aLimited !== bLimited) return aLimited - bLimited;
  const costDiff = COST_RANK[itemCost(a)] - COST_RANK[itemCost(b)];
  if (costDiff !== 0) return costDiff;
  return compareLocalized(itemName(a), itemName(b), lang);
}

/** The first plain-text run of an HTML description, e.g. `<p>Claw</p><hr />
 * ...` -> `"Claw"`. Used only to detect a Rend-shaped child action: one
 * whose description opens by naming the Strike it belongs to. */
function firstTextNode(html: string): string {
  const m = /^\s*<[^>]*>([^<]*)</.exec(html);
  return (m ? m[1]! : html.replace(/<[^>]*>/g, "")).trim();
}

/**
 * Merges a creature's actions and Strikes into one list ordered by action
 * cost (see `compareItems`). An action whose description's first text node
 * names one of the creature's own attacks (Rend on a troll opens with
 * "Claw") is pulled out as that Strike's child instead of appearing at the
 * top level — narrowly, on that exact signal, not a broader heuristic.
 *
 * `lang` defaults to "en" so every existing call site (and every ordering
 * test written before this parameter existed) keeps compiling and behaving
 * the same for plain-ASCII names — it only changes anything once a name has
 * an accented initial. `rules/` modules don't import from `state/`, so this
 * takes the language as a plain parameter rather than reading it off the
 * store itself; the caller (ActionList.tsx) is the one that knows it.
 */
export function buildActionList(actions: Action[], attacks: Attack[], lang: string = "en"): ActionListItem[] {
  const attackNames = new Set(attacks.map((a) => a.name));
  const childrenByParent = new Map<string, Action[]>();
  const topLevel: Action[] = [];

  for (const action of actions) {
    const parentName = firstTextNode(action.description);
    if (attackNames.has(parentName)) {
      const list = childrenByParent.get(parentName) ?? [];
      list.push(action);
      childrenByParent.set(parentName, list);
    } else {
      topLevel.push(action);
    }
  }
  // Same locale-aware tie-break as the top-level list (see compareItems) —
  // these names render too, so they get the same fix.
  for (const list of childrenByParent.values()) list.sort((a, b) => compareLocalized(a.name, b.name, lang));

  const items: ActionListItem[] = [
    ...topLevel.map((action): ActionListItem => ({ kind: "action", action, children: [] })),
    ...attacks.map(
      (attack, index): ActionListItem => ({
        kind: "strike",
        attack,
        index,
        children: childrenByParent.get(attack.name) ?? [],
      }),
    ),
  ];
  return items.sort((a, b) => compareItems(a, b, lang));
}
