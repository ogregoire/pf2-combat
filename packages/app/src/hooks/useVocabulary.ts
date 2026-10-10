import { useEffect, useState } from "react";
import type { Vocabulary } from "@pf2/schema";
import { getJson, type FetchFn } from "../data/catalog.js";
import { useEncounter } from "../state/store.js";

const defaultFetch: FetchFn = (url) => fetch(url);

export type VocabularyCategory = Exclude<keyof Vocabulary, "attributes">;

export interface VocabularyLookup {
  /** The display name of a slug in a category, in the display language:
   * French where the overlay has it, else English, else the slug itself
   * made readable ("low-light-vision" -> "low-light vision") — never blank. */
  name(category: VocabularyCategory, slug: string): string;
  /** An attribute's short form ("Str", "For"), same fallbacks. */
  attribute(slug: keyof Vocabulary["attributes"]): string;
}

let enCache: Promise<Vocabulary> | null = null;
let frCache: Promise<Partial<Vocabulary>> | null = null;

/** Test-only: forget the cached vocabulary files. */
export function __resetVocabularyCacheForTests(): void {
  enCache = null;
  frCache = null;
}

const readable = (slug: string): string => slug.replace(/-/g, " ");

/**
 * Display names for the slugs a creature's stat block is stored as —
 * languages, senses, skills, speeds, attributes, sizes, rarities — from
 * data/vocabulary.json and, when French is on, its French overlay. Loaded
 * once per session; until (or unless) it loads, slugs render readable.
 */
export function useVocabulary(fetchFn: FetchFn = defaultFetch): VocabularyLookup {
  const lang = useEncounter((s) => s.lang);
  const [files, setFiles] = useState<{ en: Vocabulary | null; fr: Partial<Vocabulary> | null }>({ en: null, fr: null });

  useEffect(() => {
    let cancelled = false;
    enCache ??= getJson<Vocabulary>("vocabulary.json", fetchFn).catch((e: unknown) => {
      enCache = null;
      throw e;
    });
    const fr =
      lang === "fr"
        ? (frCache ??= getJson<Partial<Vocabulary>>("i18n/fr/vocabulary.json", fetchFn).catch(() => {
            frCache = null;
            return {};
          }))
        : Promise.resolve(null);
    Promise.all([enCache, fr])
      .then(([en, frFile]) => {
        if (!cancelled) setFiles({ en, fr: frFile });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [lang, fetchFn]);

  return {
    name: (category, slug) =>
      (lang === "fr" ? files.fr?.[category]?.[slug] : undefined) ?? files.en?.[category]?.[slug] ?? readable(slug),
    attribute: (slug) =>
      (lang === "fr" ? files.fr?.attributes?.[slug]?.short : undefined) ?? files.en?.attributes?.[slug]?.short ?? slug,
  };
}
