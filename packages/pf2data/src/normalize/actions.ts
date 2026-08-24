import { z } from "zod";
import { extractRequirements, extractTrigger } from "./html.js";
import { resolveLocalize, type LangTable } from "./localize.js";
import { compareStrings } from "../util.js";

const ActionItemSchema = z.object({
  name: z.string(),
  type: z.literal("action"),
  system: z.object({
    actionType: z.object({
      value: z.enum(["action", "reaction", "free", "passive"]),
    }),
    actions: z.object({ value: z.number().nullable() }).optional(),
    category: z.string().nullish(),
    description: z.object({ value: z.string().default("") }),
    frequency: z
      .object({ max: z.number(), per: z.string() })
      .nullish(),
    trigger: z.string().nullish(),
    traits: z.object({ value: z.array(z.string()).default([]) }).optional(),
  }),
});

export type ActionCost = "1" | "2" | "3" | "reaction" | "free" | "passive";

export interface NormalizedAction {
  name: string;
  cost: ActionCost;
  category: string | null;
  traits: string[];
  trigger: string | null;
  requirements: string | null;
  frequency: { max: number; per: string } | null;
  description: string;
}

const COST_ORDER: Record<ActionCost, number> = {
  free: 0,
  reaction: 1,
  "1": 2,
  "2": 3,
  "3": 4,
  passive: 5,
};

function costOf(system: z.infer<typeof ActionItemSchema>["system"]): ActionCost {
  const kind = system.actionType.value;
  if (kind !== "action") return kind;
  const n = system.actions?.value;
  if (n === 1 || n === 2 || n === 3) return String(n) as ActionCost;
  return "passive";
}

export function normalizeActions(
  items: unknown[],
  lang: LangTable,
): NormalizedAction[] {
  const actions: NormalizedAction[] = [];

  for (const item of items) {
    const parsed = ActionItemSchema.safeParse(item);
    if (!parsed.success) continue;
    const { name, system } = parsed.data;
    // Localize first, links later (in normalizeCreature): localized glossary
    // text itself contains @UUID references that must survive to be resolved.
    const html = resolveLocalize(system.description.value, lang);

    actions.push({
      name,
      cost: costOf(system),
      category: system.category ?? null,
      traits: [...(system.traits?.value ?? [])].sort(compareStrings),
      trigger:
        system.trigger !== null && system.trigger !== undefined && system.trigger !== ""
          ? resolveLocalize(system.trigger, lang)
          : extractTrigger(html),
      requirements: extractRequirements(html),
      frequency: system.frequency
        ? { max: system.frequency.max, per: system.frequency.per }
        : null,
      description: html,
    });
  }

  return actions.sort((a, b) => {
    const limited = Number(b.frequency !== null) - Number(a.frequency !== null);
    if (limited !== 0) return limited;
    const cost = COST_ORDER[a.cost] - COST_ORDER[b.cost];
    if (cost !== 0) return cost;
    return compareStrings(a.name, b.name);
  });
}
