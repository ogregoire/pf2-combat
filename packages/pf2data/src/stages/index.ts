import type {
  BookCatalogEntry,
  Collision,
  Creature,
  IndexEntry,
} from "@pf2/schema";

export interface IndexBuild {
  books: BookCatalogEntry[];
  indexes: Record<string, IndexEntry[]>;
  collisions: Collision[];
}

const slugOf = (id: string): string => id.slice(id.indexOf("/") + 1);

export function buildIndexes(creatures: Creature[]): IndexBuild {
  const indexes: Record<string, IndexEntry[]> = {};
  const bySlug = new Map<string, string[]>();

  for (const c of creatures) {
    const pack = c.source.pack;
    const slug = slugOf(c.id);

    (indexes[pack] ??= []).push({
      id: c.id,
      slug,
      name: c.name,
      level: c.level,
      rarity: c.rarity,
      size: c.size,
      traits: c.traits,
      ac: c.ac,
      hp: c.hp,
      remaster: c.source.remaster,
      book: c.source.book,
    });

    const sharing = bySlug.get(slug) ?? [];
    sharing.push(c.id);
    bySlug.set(slug, sharing);
  }

  for (const entries of Object.values(indexes)) {
    entries.sort((a, b) => a.name.localeCompare(b.name));
  }

  const books: BookCatalogEntry[] = Object.keys(indexes)
    .sort()
    .map((pack) => {
      const first = creatures.find((c) => c.source.pack === pack)!;
      return {
        pack,
        title: first.source.book,
        license: first.source.license,
        remaster: first.source.remaster,
        creatureCount: indexes[pack]!.length,
        indexPath: `index/${pack}.json`,
      };
    });

  const collisions: Collision[] = [...bySlug.entries()]
    .filter(([, ids]) => ids.length > 1)
    .map(([slug, ids]) => ({ slug, ids: [...ids].sort() }))
    .sort((a, b) => a.slug.localeCompare(b.slug));

  return { books, indexes, collisions };
}
