import { z } from "zod";

export const IndexEntrySchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  level: z.number().int(),
  rarity: z.string(),
  size: z.string(),
  traits: z.array(z.string()),
  ac: z.number(),
  hp: z.number(),
  remaster: z.boolean(),
  book: z.string(),
});

export const BookCatalogEntrySchema = z.object({
  pack: z.string(),
  title: z.string(),
  license: z.enum(["OGL", "ORC"]),
  remaster: z.boolean(),
  creatureCount: z.number().int().nonnegative(),
  indexPath: z.string(),
});

export const CollisionSchema = z.object({
  slug: z.string(),
  ids: z.array(z.string()).min(2),
});

export type IndexEntry = z.infer<typeof IndexEntrySchema>;
export type BookCatalogEntry = z.infer<typeof BookCatalogEntrySchema>;
export type Collision = z.infer<typeof CollisionSchema>;
