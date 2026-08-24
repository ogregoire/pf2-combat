import { z } from "zod";
import { compareStrings } from "../util.js";

const IwrEntrySchema = z.object({
  type: z.string(),
  value: z.number().optional(),
  exceptions: z.array(z.string()).optional(),
  doubleVs: z.array(z.string()).optional(),
});

const SystemSchema = z.object({
  abilities: z.record(z.object({ mod: z.number() })),
  attributes: z.object({
    ac: z.object({ value: z.number(), details: z.string().optional() }),
    hp: z.object({ max: z.number(), details: z.string().optional() }),
    speed: z.object({
      // Null means the creature has no land speed at all (the Banshee flies).
      value: z.number().nullable(),
      otherSpeeds: z
        .array(z.object({ type: z.string(), value: z.number() }))
        .default([]),
    }),
    immunities: z.array(IwrEntrySchema).nullish(),
    weaknesses: z.array(IwrEntrySchema).nullish(),
    resistances: z.array(IwrEntrySchema).nullish(),
  }),
  details: z.object({
    languages: z.object({ value: z.array(z.string()).default([]) }).optional(),
  }),
  perception: z.object({
    mod: z.number(),
    senses: z
      .array(
        z.object({
          type: z.string(),
          acuity: z.string().nullish(),
          range: z.number().nullish(),
        }),
      )
      .default([]),
  }),
  saves: z.object({
    fortitude: z.object({ value: z.number(), saveDetail: z.string().nullish() }),
    reflex: z.object({ value: z.number(), saveDetail: z.string().nullish() }),
    will: z.object({ value: z.number(), saveDetail: z.string().nullish() }),
  }),
  // A null base marks an upstream data-entry artefact: three NPC Core actors
  // carry junk keys such as "+6", "athletics+15" and "occultism -1" alongside
  // their real skills. Those entries are dropped during normalization.
  skills: z.record(z.object({ base: z.number().nullable() })).default({}),
});

export interface Save {
  value: number;
  detail: string | null;
}

export interface Sense {
  type: string;
  acuity: string | null;
  range: number | null;
}

export interface IwrExtras {
  exceptions: string[];
  doubleVs: string[];
}

export interface Defenses {
  ac: number;
  acDetails: string | null;
  hp: number;
  hpDetails: string | null;
  saves: { fortitude: Save; reflex: Save; will: Save };
  immunities: ({ type: string } & IwrExtras)[];
  weaknesses: ({ type: string; value: number } & IwrExtras)[];
  resistances: ({ type: string; value: number } & IwrExtras)[];
  perception: number;
  senses: Sense[];
  languages: string[];
  skills: Record<string, number>;
  abilityMods: Record<string, number>;
  speeds: { type: string; value: number }[];
}

const extrasOf = (
  entry: Pick<z.infer<typeof IwrEntrySchema>, "exceptions" | "doubleVs">,
): IwrExtras => ({
  exceptions: [...(entry.exceptions ?? [])].sort(compareStrings),
  doubleVs: [...(entry.doubleVs ?? [])].sort(compareStrings),
});

const detailOf = (details: string | undefined | null): string | null =>
  details === undefined || details === null || details === "" ? null : details;

const valued = (
  entries: z.infer<typeof IwrEntrySchema>[] | null | undefined,
): ({ type: string; value: number } & IwrExtras)[] =>
  (entries ?? [])
    .map((e) => ({ type: e.type, value: e.value ?? 0, ...extrasOf(e) }))
    .sort((a, b) => compareStrings(a.type, b.type));

export function normalizeDefenses(system: unknown): Defenses {
  const s = SystemSchema.parse(system);

  const skills: Record<string, number> = {};
  for (const name of Object.keys(s.skills).sort()) {
    const base = s.skills[name]!.base;
    if (base === null) continue;
    skills[name] = base;
  }

  const abilityMods: Record<string, number> = {};
  for (const name of Object.keys(s.abilities).sort()) {
    abilityMods[name] = s.abilities[name]!.mod;
  }

  return {
    ac: s.attributes.ac.value,
    acDetails: detailOf(s.attributes.ac.details),
    hp: s.attributes.hp.max,
    hpDetails: detailOf(s.attributes.hp.details),
    saves: {
      fortitude: { value: s.saves.fortitude.value, detail: detailOf(s.saves.fortitude.saveDetail) },
      reflex: { value: s.saves.reflex.value, detail: detailOf(s.saves.reflex.saveDetail) },
      will: { value: s.saves.will.value, detail: detailOf(s.saves.will.saveDetail) },
    },
    immunities: (s.attributes.immunities ?? [])
      .map((i) => ({ type: i.type, ...extrasOf(i) }))
      .sort((a, b) => compareStrings(a.type, b.type)),
    weaknesses: valued(s.attributes.weaknesses),
    resistances: valued(s.attributes.resistances),
    perception: s.perception.mod,
    senses: s.perception.senses
      .map((x) => ({ type: x.type, acuity: x.acuity ?? null, range: x.range ?? null }))
      .sort((a, b) => compareStrings(a.type, b.type)),
    languages: [...(s.details.languages?.value ?? [])].sort(compareStrings),
    skills,
    abilityMods,
    speeds: [
      ...(s.attributes.speed.value === null
        ? []
        : [{ type: "land", value: s.attributes.speed.value }]),
      ...[...s.attributes.speed.otherSpeeds].sort((a, b) =>
        compareStrings(a.type, b.type),
      ),
    ],
  };
}
