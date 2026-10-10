import { useEffect, useState } from "react";
import type { Creature } from "@pf2/schema";
import type { FetchFn } from "../data/catalog.js";
import { loadCreature } from "../data/creatures.js";
import { useTraitGlossary } from "../hooks/useTraitGlossary.js";
import { useVocabulary } from "../hooks/useVocabulary.js";
import { format, useT, type StringKey } from "../i18n/index.js";
import { compareLocalized } from "../rules/compare.js";
import { conditionModifiers, type Selector } from "../rules/conditions.js";
import { formatDistance } from "../rules/distance.js";
import { resolveModifiers } from "../rules/modifiers.js";
import { useEncounter } from "../state/store.js";
import type { Combatant } from "../state/types.js";
import { TraitTag } from "./TraitTag.js";

const ATTRIBUTES = ["str", "dex", "con", "int", "wis", "cha"] as const;

function signed(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`;
}

/** One stat-block line: a bold label, then its value. */
function Line({ label, children }: { label: string; children: React.ReactNode }): React.ReactElement {
  return (
    <div>
      <span style={{ fontWeight: 700, color: "var(--text)" }}>{label}</span> {children}
    </div>
  );
}

/**
 * The rest of the active creature's stat block, under its name, the way a
 * printed one reads: rarity, size and traits; Perception and senses;
 * languages; skills; attribute modifiers; speeds; items. Read from the
 * creature record (cached, shared with the add flow), so a PC — which has
 * none — shows nothing here.
 *
 * Perception and skills are shown as they stand: an elite or weak
 * creature's ±2, and the penalties its conditions put on Perception
 * (frightened, sickened, stupefied...) and on skill checks, in red with
 * the reason on hover — the record itself holds the printed numbers.
 */
export function CreatureDetails({ combatant, fetchFn }: { combatant: Combatant; fetchFn?: FetchFn }): React.ReactElement | null {
  const t = useT();
  const lang = useEncounter((s) => s.lang);
  const vocab = useVocabulary(fetchFn);
  const glossary = useTraitGlossary(fetchFn);
  const [creature, setCreature] = useState<Creature | null>(null);
  const creatureId = combatant.creatureId;

  useEffect(() => {
    setCreature(null);
    if (creatureId === undefined) return;
    let cancelled = false;
    loadCreature(creatureId, fetchFn)
      .then((c) => {
        if (!cancelled) setCreature(c);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [creatureId, fetchFn]);

  if (combatant.kind !== "creature" || creature === null) return null;

  const step = combatant.adjustment ? (combatant.adjustment.kind === "elite" ? 2 : -2) : 0;
  const adjusted = (base: number, selector: Selector): { value: number; why: string } => {
    const mods = resolveModifiers(conditionModifiers(combatant.conditions, selector));
    return { value: base + step + mods.total, why: mods.applied.map((m) => `${m.value} ${m.source}`).join(", ") };
  };
  const number = ({ value, why }: { value: number; why: string }): React.ReactElement => (
    <span title={why || undefined} style={why ? { color: "var(--danger)" } : undefined}>
      {signed(value)}
    </span>
  );

  const senses = (creature.senses ?? []).map((s) => {
    const extra = [s.acuity ? vocab.name("acuities", s.acuity) : null, s.range ? formatDistance(s.range, lang) : null].filter(Boolean);
    return `${vocab.name("senses", s.type)}${extra.length > 0 ? ` (${extra.join(", ")})` : ""}`;
  });
  const skills = Object.entries(creature.skills ?? {})
    .map(([slug, value]) => ({ name: vocab.name("skills", slug), value }))
    .sort((a, b) => compareLocalized(a.name, b.name, lang));
  const speeds = (creature.speeds ?? []).map((s) =>
    s.type === "land" ? formatDistance(s.value, lang) : `${vocab.name("speeds", s.type).toLowerCase()} ${formatDistance(s.value, lang)}`,
  );
  // Rarity and size are named by the vocabulary; the rest by the trait glossary.
  const chips: { trait: string; label?: string }[] = [
    ...(creature.rarity && creature.rarity !== "common" ? [{ trait: creature.rarity, label: vocab.name("rarities", creature.rarity) }] : []),
    ...(creature.size ? [{ trait: creature.size, label: vocab.name("sizes", creature.size) }] : []),
    ...(creature.traits ?? []).map((trait) => ({ trait })),
  ];
  const languages = creature.languages ?? [];
  const gear = creature.gear ?? [];
  const fontStyle: React.CSSProperties = { fontSize: "12.5px", lineHeight: 1.55, color: "var(--text-dim)" };
  const label = (key: StringKey): string => t(key);

  return (
    <div data-testid="creature-details" style={{ ...fontStyle, display: "flex", flexDirection: "column", gap: "2px", marginTop: "8px" }}>
      {chips.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", marginBottom: "4px" }}>
          {chips.map(({ trait, label: chipLabel }) => (
            <TraitTag key={trait} trait={trait} label={chipLabel} glossary={glossary} />
          ))}
        </div>
      )}
      {typeof creature.perception === "number" && (
        <Line label={label("STATBLOCK_PERCEPTION")}>
          {number(adjusted(creature.perception, "perception"))}
          {senses.length > 0 && `; ${senses.join(", ")}`}
        </Line>
      )}
      {languages.length > 0 && (
        <Line label={label("STATBLOCK_LANGUAGES")}>{languages.map((l) => vocab.name("languages", l)).join(", ")}</Line>
      )}
      {skills.length > 0 && (
        <Line label={label("STATBLOCK_SKILLS")}>
          {skills.map((s, i) => (
            <span key={s.name}>
              {i > 0 && ", "}
              {s.name} {number(adjusted(s.value, "skill"))}
            </span>
          ))}
        </Line>
      )}
      {creature.abilityMods && (
        <div>
          {ATTRIBUTES.map((a, i) => (
            <span key={a}>
              {i > 0 && ", "}
              <span style={{ fontWeight: 700, color: "var(--text)" }}>{vocab.attribute(a)}</span> {signed(creature.abilityMods?.[a] ?? 0)}
            </span>
          ))}
        </div>
      )}
      {speeds.length > 0 && <Line label={label("STATBLOCK_SPEED")}>{speeds.join(", ")}</Line>}
      {gear.length > 0 && <Line label={label("STATBLOCK_ITEMS")}>{gear.join(", ")}</Line>}
      {step !== 0 && (
        <div style={{ fontSize: "11px", color: "var(--text-faint)" }}>
          {format(t("STATBLOCK_ADJUSTED_NOTE"), { step: signed(step) })}
        </div>
      )}
    </div>
  );
}
