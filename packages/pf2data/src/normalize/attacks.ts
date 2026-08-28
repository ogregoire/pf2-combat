import { z } from "zod";
import { compareStrings } from "../util.js";
import { describeItem, itemHasType } from "./item.js";

const AttackItemSchema = z.object({
  _id: z.string(),
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
  foundryId: string;
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
    if (!parsed.success) {
      // See normalizeActions: a wrong-TYPE item is expected and skipped, a
      // `type: "melee"` item that fails validation is upstream drift and must
      // be loud rather than vanish a Strike silently.
      if (itemHasType(item, "melee")) {
        throw new Error(
          `melee item ${describeItem(item)} failed validation: ${
            parsed.error.issues[0]?.message ?? "invalid"
          } (at ${parsed.error.issues[0]?.path.join(".") ?? "?"})`,
        );
      }
      continue;
    }
    const { _id, name, system } = parsed.data;
    const traits = [...(system.traits?.value ?? [])].sort(compareStrings);

    // Foundry omits `weaponType` for some ranged weapons (thrown items,
    // slings, bows in NPC Core): infer ranged from a `range-*` trait
    // (`range-120`, `range-increment-50`) or a `thrown-*` trait
    // (`thrown-20`) rather than defaulting to melee. A weapon that is thrown
    // is upstream's own signal that the Strike is ranged; explicit
    // `weaponType` (checked first) always wins, so a weapon upstream tags
    // "melee" despite carrying a thrown-* trait is left alone.
    const kind =
      system.weaponType?.value ??
      (traits.some((t) => t.startsWith("range-") || t.startsWith("thrown-"))
        ? "ranged"
        : "melee");

    attacks.push({
      foundryId: _id,
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
