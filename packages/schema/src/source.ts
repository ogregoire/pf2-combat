import { z } from "zod";

export const CreatureSourceSchema = z.object({
  pack: z.string().min(1),
  book: z.string().min(1),
  license: z.enum(["OGL", "ORC"]),
  remaster: z.boolean(),
});

export type CreatureSource = z.infer<typeof CreatureSourceSchema>;

const PublicationSchema = z.object({
  license: z.enum(["OGL", "ORC"]),
  remaster: z.boolean(),
  title: z.string(),
});

export function parseSource(publication: unknown, pack: string): CreatureSource {
  const pub = PublicationSchema.parse(publication);
  return CreatureSourceSchema.parse({
    pack,
    book: pub.title.trim() === "" ? pack : pub.title,
    license: pub.license,
    remaster: pub.remaster,
  });
}
