import { z } from "zod";
import { compareStrings } from "../util.js";

const AttackItemSchema = z.object({
  name: z.string(),
  type: z.literal("melee"),
  system: z.object({
    bonus: z.object({ value: z.number() }),
    damageRolls: z
      .record(
        z.object({
          damage: z.string(),
          damageType: z.string(),
          category: z.string().nullish(),
        }),
      )
      .default({}),
    traits: z.object({ value: z.array(z.string()).default([]) }).optional(),
    weaponType: z.object({ value: z.enum(["melee", "ranged"]) }).nullish(),
    attackEffects: z.object({ value: z.array(z.string()).default([]) }).optional(),
  }),
});

export interface NormalizedAttack {
  name: string;
  kind: "melee" | "ranged";
  bonus: number;
  damage: { formula: string; type: string; category: string | null }[];
  traits: string[];
  effects: string[];
}

export function normalizeAttacks(items: unknown[]): NormalizedAttack[] {
  const attacks: NormalizedAttack[] = [];

  for (const item of items) {
    const parsed = AttackItemSchema.safeParse(item);
    if (!parsed.success) continue;
    const { name, system } = parsed.data;
    const traits = [...(system.traits?.value ?? [])].sort(compareStrings);

    // Foundry omits `weaponType` for some ranged weapons (thrown items,
    // slings, bows in NPC Core): infer ranged from a `range-*` trait
    // (`range-120`, `range-increment-50`) rather than defaulting to melee.
    const kind =
      system.weaponType?.value ??
      (traits.some((t) => t.startsWith("range-")) ? "ranged" : "melee");

    attacks.push({
      name,
      kind,
      bonus: system.bonus.value,
      damage: Object.values(system.damageRolls)
        .map((d) => ({
          formula: d.damage,
          type: d.damageType,
          category: d.category ?? null,
        }))
        .sort((a, b) => compareStrings(a.formula, b.formula)),
      traits,
      effects: [...(system.attackEffects?.value ?? [])].sort(compareStrings),
    });
  }

  return attacks.sort((a, b) => compareStrings(a.name, b.name));
}
