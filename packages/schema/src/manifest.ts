import { z } from "zod";
import { CollisionSchema } from "./book.js";

export const ManifestSchema = z.object({
  toolVersion: z.string(),
  upstreamRepo: z.string(),
  upstreamRef: z.string(),
  generatedAt: z.string(),
  packs: z.array(z.string()),
  creatureCount: z.number().int().nonnegative(),
  collisions: z.array(CollisionSchema),
});

export type Manifest = z.infer<typeof ManifestSchema>;
