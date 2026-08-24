import type { Creature } from "@pf2/schema";
import type { FetchFn } from "./catalog.js";

const cache = new Map<string, Creature>();
const BASE = import.meta.env.BASE_URL ?? "/";

export async function loadCreature(
  id: string,
  fetchFn: FetchFn = (url) => fetch(url),
): Promise<Creature> {
  const held = cache.get(id);
  if (held !== undefined) return held;

  const res = await fetchFn(`${BASE}data/creatures/${id}.json`);
  if (!res.ok) throw new Error(`failed to load creature ${id}: ${res.status}`);
  const creature = (await res.json()) as Creature;
  cache.set(id, creature);
  return creature;
}

export function clearCreatureCache(): void {
  cache.clear();
}
