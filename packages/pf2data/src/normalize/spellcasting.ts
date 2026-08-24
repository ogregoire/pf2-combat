import { z } from "zod";
import { compareStrings } from "../util.js";

const EntryItemSchema = z.object({
  _id: z.string(),
  name: z.string(),
  type: z.literal("spellcastingEntry"),
  system: z.object({
    prepared: z.object({ value: z.string() }),
    slots: z
      .record(z.object({ max: z.number(), value: z.number() }))
      .default({}),
    spelldc: z.object({ dc: z.number(), value: z.number() }),
    tradition: z.object({ value: z.string() }),
  }),
});

const SpellItemSchema = z.object({
  name: z.string(),
  type: z.literal("spell"),
  system: z.object({
    level: z.object({ value: z.number() }),
    location: z.object({ value: z.string().nullish() }),
    ritual: z.unknown().nullish(),
  }),
});

export interface SpellcastingEntry {
  name: string;
  tradition: string;
  preparation: string;
  dc: number;
  attack: number;
  slots: { rank: number; max: number }[];
  spells: { name: string; rank: number }[];
}

export function normalizeSpellcasting(items: unknown[]): SpellcastingEntry[] {
  const entries = new Map<string, SpellcastingEntry>();

  for (const item of items) {
    const parsed = EntryItemSchema.safeParse(item);
    if (!parsed.success) continue;
    const { _id, name, system } = parsed.data;

    const slots = Object.entries(system.slots)
      .map(([key, slot]) => ({
        rank: Number.parseInt(key.replace("slot", ""), 10),
        max: slot.max,
      }))
      .filter((s) => Number.isFinite(s.rank) && s.max > 0)
      .sort((a, b) => a.rank - b.rank);

    entries.set(_id, {
      name,
      tradition: system.tradition.value,
      preparation: system.prepared.value,
      dc: system.spelldc.dc,
      attack: system.spelldc.value,
      slots,
      spells: [],
    });
  }

  for (const item of items) {
    const parsed = SpellItemSchema.safeParse(item);
    if (!parsed.success) continue;
    // Rituals are not cast from a spellcasting entry: upstream gives them a
    // populated `ritual` block, a cast time in days, and a null location.
    // Skipping them explicitly means a null location on a NON-ritual spell
    // stays visible as the broken link it would be.
    const { ritual } = parsed.data.system;
    if (ritual !== null && ritual !== undefined) continue;
    const owner = parsed.data.system.location.value;
    if (owner === null || owner === undefined) continue;
    const entry = entries.get(owner);
    if (entry === undefined) continue;
    entry.spells.push({
      name: parsed.data.name,
      rank: parsed.data.system.level.value,
    });
  }

  for (const entry of entries.values()) {
    entry.spells.sort(
      (a, b) => b.rank - a.rank || compareStrings(a.name, b.name),
    );
  }

  return [...entries.values()].sort((a, b) => compareStrings(a.name, b.name));
}
