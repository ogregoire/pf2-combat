import { z } from "zod";

const IwrEntrySchema = z.object({
  type: z.string(),
  value: z.number().optional(),
});

const SystemSchema = z.object({
  abilities: z.record(z.object({ mod: z.number() })),
  attributes: z.object({
    ac: z.object({ value: z.number() }),
    hp: z.object({ max: z.number() }),
    speed: z.object({
      value: z.number(),
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
    senses: z.array(z.object({ type: z.string() })).default([]),
  }),
  saves: z.object({
    fortitude: z.object({ value: z.number() }),
    reflex: z.object({ value: z.number() }),
    will: z.object({ value: z.number() }),
  }),
  skills: z.record(z.object({ base: z.number() })).default({}),
});

export interface Defenses {
  ac: number;
  hp: number;
  saves: { fortitude: number; reflex: number; will: number };
  immunities: string[];
  weaknesses: { type: string; value: number }[];
  resistances: { type: string; value: number }[];
  perception: number;
  senses: string[];
  languages: string[];
  skills: Record<string, number>;
  abilityMods: Record<string, number>;
  speeds: { type: string; value: number }[];
}

const valued = (
  entries: { type: string; value?: number }[] | null | undefined,
): { type: string; value: number }[] =>
  (entries ?? [])
    .map((e) => ({ type: e.type, value: e.value ?? 0 }))
    .sort((a, b) => a.type.localeCompare(b.type));

export function normalizeDefenses(system: unknown): Defenses {
  const s = SystemSchema.parse(system);

  const skills: Record<string, number> = {};
  for (const name of Object.keys(s.skills).sort()) {
    skills[name] = s.skills[name]!.base;
  }

  const abilityMods: Record<string, number> = {};
  for (const name of Object.keys(s.abilities).sort()) {
    abilityMods[name] = s.abilities[name]!.mod;
  }

  return {
    ac: s.attributes.ac.value,
    hp: s.attributes.hp.max,
    saves: {
      fortitude: s.saves.fortitude.value,
      reflex: s.saves.reflex.value,
      will: s.saves.will.value,
    },
    immunities: (s.attributes.immunities ?? [])
      .map((i) => i.type)
      .sort((a, b) => a.localeCompare(b)),
    weaknesses: valued(s.attributes.weaknesses),
    resistances: valued(s.attributes.resistances),
    perception: s.perception.mod,
    senses: s.perception.senses
      .map((x) => x.type)
      .sort((a, b) => a.localeCompare(b)),
    languages: [...(s.details.languages?.value ?? [])].sort((a, b) =>
      a.localeCompare(b),
    ),
    skills,
    abilityMods,
    speeds: [
      { type: "land", value: s.attributes.speed.value },
      ...[...s.attributes.speed.otherSpeeds].sort((a, b) =>
        a.type.localeCompare(b.type),
      ),
    ],
  };
}
