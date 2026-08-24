import { useEffect, useState } from "react";
import type { IndexEntry } from "@pf2/schema";
import { loadBooks, loadIndex, resolveCollisions, type FetchFn } from "../data/catalog.js";

export type CatalogState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; entries: IndexEntry[] };

/**
 * Loads every book's index on mount and merges them through
 * `resolveCollisions`, so `AddCombatants` has a full catalog to search the
 * moment the screen opens — no per-book enable/disable control exists yet
 * (deferred, like `<GroupBuilder>`), so all books load by default. `fetchFn`
 * is injectable for tests, the same pattern `catalog.ts` and
 * `AddCombatants`'s own `loadCreatureFn` already use.
 */
export function useCatalog(fetchFn?: FetchFn): CatalogState {
  const [state, setState] = useState<CatalogState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });

    loadBooks(fetchFn)
      .then((books) => Promise.all(books.map((book) => loadIndex(book.pack, fetchFn))))
      .then((perBook) => {
        if (cancelled) return;
        setState({ status: "ready", entries: resolveCollisions(perBook.flat()) });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setState({
          status: "error",
          message: err instanceof Error ? err.message : "failed to load the creature catalog",
        });
      });

    return () => {
      cancelled = true;
    };
  }, [fetchFn]);

  return state;
}
