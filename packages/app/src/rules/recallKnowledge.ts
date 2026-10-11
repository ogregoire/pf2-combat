/** GM Core's DCs by level (Table 10-5), level −1 to 25. */
const DC_BY_LEVEL = [13, 14, 15, 16, 18, 19, 20, 22, 23, 24, 26, 27, 28, 30, 31, 32, 34, 35, 36, 38, 39, 40, 42, 44, 46, 48, 50];
/** Rarity's adjustment to it (GM Core, Adjusting Difficulty). */
const RARITY: Record<string, number> = { common: 0, uncommon: 2, rare: 5, unique: 10 };

/** GM Core's Creature Identification table: which skills recall
 * knowledge of a creature, by its traits. */
const SKILLS_BY_TRAIT: Record<string, string[]> = {
  aberration: ["occultism"], animal: ["nature"], astral: ["occultism"], beast: ["arcana", "nature"],
  celestial: ["religion"], construct: ["arcana", "crafting"], dragon: ["arcana"], dream: ["occultism"],
  elemental: ["arcana", "nature"], ethereal: ["occultism"], fey: ["nature"], fiend: ["religion"],
  fungus: ["nature"], giant: ["society"], humanoid: ["society"], monitor: ["religion"], ooze: ["occultism"],
  plant: ["nature"], shade: ["religion"], spirit: ["occultism"], time: ["occultism"], undead: ["religion"],
};

/**
 * The DC to Recall Knowledge about a creature — its level's DC, raised by
 * its rarity — and the skills that can, from its traits (Lore always can,
 * at a lower DC the GM sets). Level is the creature's as it stands, elite
 * or weak included.
 */
export function recallKnowledge(level: number, rarity: string | undefined, traits: string[]): { dc: number; skills: string[] } {
  const dc = DC_BY_LEVEL[Math.min(Math.max(level, -1), 25) + 1]! + (RARITY[rarity ?? "common"] ?? 0);
  const skills = [...new Set(traits.flatMap((t) => SKILLS_BY_TRAIT[t] ?? []))];
  return { dc, skills };
}

/** An aura's radius in feet, as its text gives it — an emanation marker or
 * a leading "30 feet." — or null. */
export function auraRadius(description: string): number | null {
  const m = /@Template\[emanation\|distance:(\d+)\]/.exec(description) ?? /^<p>(\d+) feet\b/.exec(description);
  return m ? Number(m[1]) : null;
}

/** A creature's auras: its abilities with the aura trait, telepathy aside
 * (an aura in the rules' sense, but nothing to watch in a fight). */
export function auras<T extends { name: string; traits: string[]; description: string }>(actions: T[]): T[] {
  return actions.filter((a) => a.traits.includes("aura") && !/^telepathy\b/i.test(a.name));
}
