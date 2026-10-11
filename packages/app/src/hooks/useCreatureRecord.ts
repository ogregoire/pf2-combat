import { useEffect, useState } from "react";
import type { Creature } from "@pf2/schema";
import type { FetchFn } from "../data/catalog.js";
import { loadCreature } from "../data/creatures.js";

/** A combatant's full creature record (skills, attributes, senses…), which
 * the combatant itself doesn't carry; null for a PC, or until it loads. */
export function useCreatureRecord(creatureId: string | undefined, fetchFn?: FetchFn): Creature | null {
  const [creature, setCreature] = useState<Creature | null>(null);
  useEffect(() => {
    setCreature(null);
    if (creatureId === undefined) return;
    let cancelled = false;
    loadCreature(creatureId, fetchFn)
      .then((c) => {
        if (!cancelled) setCreature(c);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [creatureId, fetchFn]);
  return creature;
}
