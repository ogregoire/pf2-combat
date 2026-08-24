import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import type { Condition, GlossaryEntry } from "@pf2/schema";
import { walkPack } from "../io/walk.js";
import { resolveLinks } from "../normalize/links.js";
import { resolveLocalize, type LangTable } from "../normalize/localize.js";

const ConditionItemSchema = z.object({
  name: z.string(),
  type: z.literal("condition"),
  system: z.object({
    description: z.object({ value: z.string().default("") }),
    value: z.object({ isValued: z.boolean() }),
  }),
});

const GlossaryItemSchema = z.object({
  name: z.string(),
  type: z.literal("action"),
  system: z.object({
    actionType: z.object({
      value: z.enum(["action", "reaction", "free", "passive"]),
    }),
    actions: z.object({ value: z.number().nullable() }).optional(),
    description: z.object({ value: z.string().default("") }),
    traits: z.object({ value: z.array(z.string()).default([]) }).optional(),
  }),
});

export function buildConditions(packsDir: string, packs: string[]): Condition[] {
  const conditions: Condition[] = [];

  for (const pack of packs) {
    for (const file of walkPack(join(packsDir, pack))) {
      const raw: unknown = JSON.parse(readFileSync(file.absolutePath, "utf8"));
      const parsed = ConditionItemSchema.safeParse(raw);
      if (!parsed.success) continue;
      conditions.push({
        slug: file.slug,
        name: parsed.data.name,
        isValued: parsed.data.system.value.isValued,
        description: resolveLinks(parsed.data.system.description.value),
      });
    }
  }

  return conditions.sort((a, b) => a.slug.localeCompare(b.slug));
}

export function buildGlossary(
  packsDir: string,
  lang: LangTable,
  packs: string[],
): GlossaryEntry[] {
  const entries: GlossaryEntry[] = [];

  for (const pack of packs) {
    for (const file of walkPack(join(packsDir, pack))) {
      const raw: unknown = JSON.parse(readFileSync(file.absolutePath, "utf8"));
      const parsed = GlossaryItemSchema.safeParse(raw);
      if (!parsed.success) continue;
      const { name, system } = parsed.data;

      const kind = system.actionType.value;
      const n = system.actions?.value;
      const cost =
        kind !== "action"
          ? kind
          : n === 1 || n === 2 || n === 3
            ? (String(n) as GlossaryEntry["cost"])
            : "passive";

      entries.push({
        slug: file.slug,
        name,
        cost,
        traits: [...(system.traits?.value ?? [])].sort((a, b) =>
          a.localeCompare(b),
        ),
        description: resolveLinks(
          resolveLocalize(system.description.value, lang),
        ),
      });
    }
  }

  return entries.sort((a, b) => a.slug.localeCompare(b.slug));
}
