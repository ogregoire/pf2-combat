const XP_BY_DELTA: Record<number, number> = {
  [-4]: 10, [-3]: 15, [-2]: 20, [-1]: 30,
  0: 40, 1: 60, 2: 80, 3: 120, 4: 160,
};

export function creatureXp(creatureLevel: number, partyLevel: number): number {
  const delta = creatureLevel - partyLevel;
  if (delta < -4) return 0;
  if (delta > 4) return 160;
  return XP_BY_DELTA[delta]!;
}

export function encounterXp(levels: number[], partyLevel: number): number {
  return levels.reduce((sum, l) => sum + creatureXp(l, partyLevel), 0);
}

export interface PartyLevel {
  level: number;
  extraPcs: number;
  derivation: string;
}

/**
 * GM Core, Group Parity and Party Level. Evaluated in order — the
 * one-character-far-ahead rule takes precedence over the highest/average
 * choice, because it changes both the level AND the effective party size.
 */
export function partyLevelFor(presentLevels: number[]): PartyLevel {
  if (presentLevels.length === 0) {
    return { level: 1, extraPcs: 0, derivation: "no players present" };
  }
  const sorted = [...presentLevels].sort((a, b) => b - a);
  const top = sorted[0]!;
  const rest = sorted.slice(1);

  if (rest.length > 0) {
    const restTop = rest[0]!;
    const excess = top - restTop;
    if (excess >= 2 && rest.every((l) => top - l >= 2)) {
      const extraPcs = Math.floor(excess / 2);
      return {
        level: restTop,
        extraPcs,
        derivation: `one character ${excess} levels ahead — party level ${restTop}, counted as ${extraPcs} extra PC(s)`,
      };
    }
  }

  const behind = sorted.filter((l) => l < top).length;
  if (behind <= 2) {
    return {
      level: top,
      extraPcs: 0,
      derivation: `${behind} behind the top — using the highest level ${top}`,
    };
  }

  const average = Math.round(
    presentLevels.reduce((a, b) => a + b, 0) / presentLevels.length,
  );
  return {
    level: average,
    extraPcs: 0,
    derivation: `levels ${sorted.join("/")} — average = ${average}`,
  };
}
