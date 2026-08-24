import { z } from "zod";

const ALIGNMENT_TRAITS = new Set([
  "lawful",
  "chaotic",
  "good",
  "evil",
  "neutral",
]);

const SIZES: Record<string, string> = {
  tiny: "tiny",
  sm: "small",
  med: "medium",
  lg: "large",
  huge: "huge",
  grg: "gargantuan",
};

const RawTraitsSchema = z.object({
  rarity: z.enum(["common", "uncommon", "rare", "unique"]).default("common"),
  size: z.object({ value: z.string() }),
  value: z.array(z.string()).default([]),
});

export interface NormalizedTraits {
  rarity: "common" | "uncommon" | "rare" | "unique";
  size: string;
  traits: string[];
}

export function normalizeTraits(raw: unknown): NormalizedTraits {
  const parsed = RawTraitsSchema.parse(raw);
  const size = SIZES[parsed.size.value];
  if (size === undefined) {
    throw new Error(`Unknown Foundry size abbreviation: ${parsed.size.value}`);
  }
  return {
    rarity: parsed.rarity,
    size,
    traits: parsed.value
      .filter((t) => !ALIGNMENT_TRAITS.has(t))
      .sort((a, b) => a.localeCompare(b)),
  };
}
