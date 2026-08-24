import { z } from "zod";

const AttackItemSchema = z.object({
  name: z.string(),
  type: z.literal("melee"),
  system: z.object({
    bonus: z.object({ value: z.number() }),
    damageRolls: z
      .record(z.object({ damage: z.string(), damageType: z.string() }))
      .default({}),
    traits: z.object({ value: z.array(z.string()).default([]) }).optional(),
    weaponType: z.object({ value: z.enum(["melee", "ranged"]) }).optional(),
  }),
});

export interface NormalizedAttack {
  name: string;
  kind: "melee" | "ranged";
  bonus: number;
  damage: { formula: string; type: string }[];
  traits: string[];
}

export function normalizeAttacks(items: unknown[]): NormalizedAttack[] {
  const attacks: NormalizedAttack[] = [];

  for (const item of items) {
    const parsed = AttackItemSchema.safeParse(item);
    if (!parsed.success) continue;
    const { name, system } = parsed.data;

    attacks.push({
      name,
      kind: system.weaponType?.value ?? "melee",
      bonus: system.bonus.value,
      damage: Object.values(system.damageRolls)
        .map((d) => ({ formula: d.damage, type: d.damageType }))
        .sort((a, b) => a.formula.localeCompare(b.formula)),
      traits: [...(system.traits?.value ?? [])].sort((a, b) =>
        a.localeCompare(b),
      ),
    });
  }

  return attacks.sort((a, b) => a.name.localeCompare(b.name));
}
