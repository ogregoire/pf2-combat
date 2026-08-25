import { z } from "zod";
import { CollisionSchema } from "./book.js";

export const ManifestSchema = z.object({
  toolVersion: z.string(),
  upstreamRepo: z.string(),
  upstreamRef: z.string(),
  // TODO(task-7): drop these defaults once data/manifest.json is regenerated
  // with real frRepo/frRef values; until then the committed manifest lacks
  // these fields and would otherwise fail to parse.
  frRepo: z.string().default(""),
  frRef: z.string().default(""),
  generatedAt: z.string(),
  packs: z.array(z.string()),
  creatureCount: z.number().int().nonnegative(),
  collisions: z.array(CollisionSchema),
});

export type Manifest = z.infer<typeof ManifestSchema>;
