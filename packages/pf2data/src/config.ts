import { readFileSync } from "node:fs";
import { z } from "zod";

export const PackConfigSchema = z.object({
  name: z.string().min(1),
  kind: z.enum(["creatures", "conditions", "glossary", "features"]),
});

export const Pf2DataConfigSchema = z.object({
  upstream: z.object({
    repo: z.string().url(),
    branch: z.string().min(1),
  }),
  french: z.object({
    repo: z.string().url(),
    branch: z.string().min(1),
  }),
  packs: z.array(PackConfigSchema).min(1),
});

export type PackConfig = z.infer<typeof PackConfigSchema>;
export type Pf2DataConfig = z.infer<typeof Pf2DataConfigSchema>;

export function loadConfig(path: string): Pf2DataConfig {
  const raw: unknown = JSON.parse(readFileSync(path, "utf8"));
  return Pf2DataConfigSchema.parse(raw);
}
