import { useState } from "react";
import type { Spellcasting } from "@pf2/schema";
import { useCombatantI18n } from "../hooks/useCombatantI18n.js";
import { format, useT, type StringKey } from "../i18n/index.js";
import { canReact, conditionModifiers, stupefiedCastDc } from "../rules/conditions.js";
import { resolveModifiers } from "../rules/modifiers.js";
import { castsLeft, focusPool, FOCUS_KEY, spellRows, type SpellCost, type SpellRow } from "../rules/spells.js";
import { useEncounter } from "../state/store.js";
import type { Combatant } from "../state/types.js";
import type { FetchFn } from "../data/catalog.js";
import { useSpellDetail } from "../hooks/useSpellDetail.js";
import { useTraitGlossary } from "../hooks/useTraitGlossary.js";
import { renderMarkers } from "../rules/renderMarkers.js";
import type { TraitInfo } from "../rules/traitInfo.js";
import { TraitTag } from "./TraitTag.js";
import { remainingActionsFor } from "./TurnManager.js";
import { deltaColor } from "./deltaTone.js";

const TRADITION_KEY: Record<string, StringKey> = {
  arcane: "TRADITION_ARCANE",
  divine: "TRADITION_DIVINE",
  occult: "TRADITION_OCCULT",
  primal: "TRADITION_PRIMAL",
};

const PREPARATION_KEY: Record<string, StringKey> = {
  innate: "PREPARATION_INNATE",
  spontaneous: "PREPARATION_SPONTANEOUS",
  prepared: "PREPARATION_PREPARED",
  focus: "PREPARATION_FOCUS",
};

function signed(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`;
}

/** "primal innate", "arcane prepared" — the entry's own name is English
 * prose ("Primal Innate Spells"), so it is rebuilt from its two parts. */
function entryLabel(entry: Spellcasting, t: (key: StringKey) => string): string {
  const tradition = TRADITION_KEY[entry.tradition];
  const preparation = PREPARATION_KEY[entry.preparation];
  return [tradition ? t(tradition) : entry.tradition, preparation ? t(preparation) : entry.preparation].join(" ");
}

/** "10 minutes" and the like, in the display language. */
function longCastText(text: string, t: (key: StringKey) => string): string {
  const m = /^(\d+) (minute|hour|day)s?$/.exec(text);
  if (!m) return text;
  const key: StringKey = m[2] === "minute" ? "CAST_TIME_MINUTES" : m[2] === "hour" ? "CAST_TIME_HOURS" : "CAST_TIME_DAYS";
  return format(t(key), { n: Number(m[1]) });
}

function CostGlyph({ cost, t }: { cost: SpellCost; t: (key: StringKey) => string }): React.ReactElement {
  if (cost.kind === "actions") {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: "3px", flexShrink: 0 }}>
        {Array.from({ length: cost.max }, (_, i) => (
          <svg key={i} data-testid="cost-pip" width="11" height="11" viewBox="0 0 12 12" style={{ opacity: i < cost.min ? 1 : 0.4 }}>
            <path d="M6 0.6 11.4 6 6 11.4 0.6 6Z" fill="var(--action)" />
          </svg>
        ))}
      </span>
    );
  }
  const label = cost.kind === "reaction" ? t("COST_REACTION") : cost.kind === "free" ? t("COST_FREE") : longCastText(cost.text, t);
  return <span style={{ fontSize: "10px", letterSpacing: "0.06em", color: "var(--text-faint)", flexShrink: 0 }}>{label}</span>;
}

const badgeStyle: React.CSSProperties = {
  fontSize: "10px",
  letterSpacing: "0.04em",
  padding: "1px 6px",
  borderRadius: "2px",
  background: "var(--border)",
  color: "var(--text-dim)",
  whiteSpace: "nowrap",
};

function castButtonStyle(disabled: boolean): React.CSSProperties {
  return {
    fontFamily: "inherit",
    fontSize: "11px",
    fontWeight: 600,
    padding: "4px 9px",
    borderRadius: "3px",
    border: `1px solid ${disabled ? "var(--border-strong)" : "var(--action)"}`,
    background: disabled ? "var(--panel)" : "var(--action)",
    color: disabled ? "var(--text-faint)" : "var(--action-text)",
    opacity: disabled ? 0.55 : 1,
    cursor: disabled ? "default" : "pointer",
    whiteSpace: "nowrap",
  };
}

const SAVE_LABEL: Record<string, StringKey> = { fortitude: "LABEL_FORTITUDE", reflex: "LABEL_REFLEX", will: "LABEL_WILL" };

/** "30 feet" -> "9 m" and the few words ranges use, for a French reader
 * when the French overlay has no translated range of its own. */
function frRange(range: string): string {
  const feet = /^(\d+) feet$/.exec(range);
  if (feet) return renderMarkers(`@Template[x|distance:${feet[1]}]`, "fr").replace(/^x de /, "");
  return ({ touch: "contact", planetary: "planétaire", unlimited: "illimitée" } as Record<string, string>)[range] ?? range;
}

/** A spell's rules, shown when its row is unfolded: traits, then range,
 * area, targets, defense and duration on one line, then the full text.
 * Fetched on first unfold (useSpellDetail); French where the overlay has
 * it, field by field. */
function SpellDetails({ slug, glossary, fetchFn }: { slug: string; glossary: Map<string, TraitInfo>; fetchFn?: FetchFn }): React.ReactElement {
  const t = useT();
  const lang = useEncounter((s) => s.lang);
  const loaded = useSpellDetail(slug, true, fetchFn);
  const boxStyle: React.CSSProperties = { marginTop: "8px", fontSize: "12.5px", lineHeight: 1.5, color: "var(--text-dim)" };
  if (loaded === "loading") return <div style={boxStyle}>{t("SPELL_DETAILS_LOADING")}</div>;
  if (loaded === "error") return <div style={boxStyle}>{t("SPELL_DETAILS_UNAVAILABLE")}</div>;
  const { detail, fr } = loaded;
  const fr_ = lang === "fr" ? fr : null;

  const facts: [StringKey, string][] = [];
  const range = fr_?.range ?? (detail.range && (lang === "fr" ? frRange(detail.range) : detail.range));
  if (range) facts.push(["SPELL_RANGE", range]);
  if (detail.area) facts.push(["SPELL_AREA", renderMarkers(`@Template[${detail.area.type}|distance:${detail.area.value}]`, lang)]);
  const targets = fr_?.targets ?? detail.targets;
  if (targets) facts.push(["SPELL_TARGETS", targets]);
  if (detail.defense) {
    const save = t(SAVE_LABEL[detail.defense.save] ?? "LABEL_WILL");
    facts.push(["SPELL_DEFENSE", detail.defense.basic ? format(t("SPELL_BASIC_SAVE"), { save }) : save]);
  }
  const duration = fr_?.duration ?? detail.duration;
  if (duration) facts.push(["SPELL_DURATION", detail.sustained ? `${t("SPELL_SUSTAINED")} — ${duration}` : duration]);
  else if (detail.sustained) facts.push(["SPELL_DURATION", t("SPELL_SUSTAINED")]);

  return (
    <div data-testid="spell-details" style={boxStyle}>
      {detail.traits.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", marginBottom: "6px" }}>
          {detail.traits.map((trait) => (
            <TraitTag key={trait} trait={trait} glossary={glossary} />
          ))}
        </div>
      )}
      {facts.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "2px 14px", marginBottom: "6px" }}>
          {facts.map(([label, value]) => (
            <span key={label}>
              <span style={{ fontWeight: 600, color: "var(--text)" }}>{t(label)}</span> {value}
            </span>
          ))}
        </div>
      )}
      <div dangerouslySetInnerHTML={{ __html: renderMarkers(fr_?.description ?? detail.description, lang) }} />
    </div>
  );
}

/** One spell: cost, name, rank, how many casts are left, and the controls
 * to cast it. Casting spends one from the spell's pool and the actions (or
 * the reaction) it costs; a ranged cost ("1 to 3") offers one button per
 * action count. A limited spell already cast can be taken back. */
function SpellRowView({
  combatant,
  row,
  name,
  showEntry,
  expanded,
  onToggle,
  glossary,
  fetchFn,
}: {
  combatant: Combatant;
  row: SpellRow;
  name: string;
  showEntry: boolean;
  expanded: boolean;
  onToggle: () => void;
  glossary: Map<string, TraitInfo>;
  fetchFn?: FetchFn;
}): React.ReactElement {
  const t = useT();
  const spendSpell = useEncounter((s) => s.spendSpell);
  const spendActions = useEncounter((s) => s.spendActions);
  const setReactionSpent = useEncounter((s) => s.setReactionSpent);
  const uses = combatant.spellUses ?? {};
  const left = castsLeft(row.limit, uses);
  const spent = row.limit.kind === "limited" ? (uses[row.limit.key] ?? 0) : 0;
  const remaining = remainingActionsFor(combatant);
  const exhausted = left === 0;

  const cast = (actions: number | "reaction" | "free"): void => {
    if (row.limit.kind === "limited") spendSpell(combatant.id, row.limit.key);
    if (actions === "reaction") setReactionSpent(combatant.id, true);
    else if (typeof actions === "number") spendActions(combatant.id, actions);
  };

  let limitText: string | null = null;
  if (row.limit.kind === "constant") limitText = t("SPELL_CONSTANT");
  else if (row.spell.frequency === "at-will") limitText = t("SPELL_AT_WILL");
  else if (row.limit.kind === "limited") {
    const key: StringKey =
      row.limit.per === "day" ? "SPELL_PER_DAY" : row.limit.per === "slot" ? "SPELL_SLOTS" : row.limit.per === "prepared" ? "SPELL_PREPARED" : "SPELL_FOCUS";
    limitText = format(t(key), { left: left ?? 0, max: row.limit.max, rank: row.spell.rank });
  }

  const rankText = format(t(row.spell.cantrip ? "SPELL_CANTRIP" : "SPELL_RANK"), { rank: row.spell.rank });

  let controls: React.ReactNode = null;
  if (row.limit.kind !== "constant") {
    if (row.cost.kind === "actions") {
      const { min, max } = row.cost;
      const counts = Array.from({ length: max - min + 1 }, (_, i) => min + i);
      controls = counts.map((n) => {
        const disabled = exhausted || n > remaining;
        const label = format(t("CAST_WITH_ACTIONS_ARIA"), { name, n });
        return (
          <button key={n} type="button" aria-label={label} title={label} disabled={disabled} onClick={() => cast(n)} style={castButtonStyle(disabled)}>
            {counts.length > 1 ? `${t("CAST_BUTTON")} ${n}` : t("CAST_BUTTON")}
          </button>
        );
      });
    } else if (row.cost.kind === "reaction") {
      const disabled = exhausted || combatant.reactionSpent || !canReact(combatant.conditions);
      controls = (
        <button type="button" aria-label={format(t("CAST_NAME_ARIA"), { name })} disabled={disabled} onClick={() => cast("reaction")} style={castButtonStyle(disabled)}>
          {t("CAST_BUTTON")}
        </button>
      );
    } else if (row.cost.kind === "free") {
      controls = (
        <button type="button" aria-label={format(t("CAST_NAME_ARIA"), { name })} disabled={exhausted} onClick={() => cast("free")} style={castButtonStyle(exhausted)}>
          {t("CAST_BUTTON")}
        </button>
      );
    }
  }

  return (
    <div
      data-testid="spell-row"
      style={{
        padding: "8px 12px",
        borderRadius: "4px",
        background: exhausted ? "var(--panel)" : "var(--panel-raised)",
        border: exhausted ? "1px dashed var(--border)" : "1px solid var(--border-strong)",
        opacity: exhausted ? 0.6 : 1,
      }}
    >
      <div
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggle();
          }
        }}
        style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer" }}
      >
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true" style={{ transform: expanded ? "rotate(90deg)" : "none", flexShrink: 0, color: "var(--text-faint)" }}>
          <path d="M3 1.5 7 5 3 8.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <CostGlyph cost={row.cost} t={t} />
        <div style={{ flexGrow: 1, minWidth: 0, display: "flex", alignItems: "center", flexWrap: "wrap", gap: "4px 8px" }}>
          <span style={{ fontWeight: 600 }}>{name}</span>
          <span style={badgeStyle}>{rankText}</span>
          {limitText !== null && <span style={badgeStyle}>{limitText}</span>}
          {showEntry && <span style={{ fontSize: "10.5px", color: "var(--text-faint)" }}>{entryLabel(row.entry, t)}</span>}
        </div>
        {spent > 0 && (
          <button
            type="button"
            aria-label={format(t("UNDO_CAST_ARIA"), { name })}
            title={format(t("UNDO_CAST_ARIA"), { name })}
            onClick={(e) => {
              e.stopPropagation();
              if (row.limit.kind === "limited") spendSpell(combatant.id, row.limit.key, -1);
            }}
            style={{ ...castButtonStyle(true), opacity: 1, cursor: "pointer", color: "var(--text-dim)", padding: "4px 6px" }}
          >
            <svg width="11" height="11" viewBox="0 0 16 16" aria-hidden="true" style={{ display: "block" }}>
              <path d="M5 3 2 6l3 3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M2.5 6H10a4 4 0 0 1 0 8H7" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        )}
        {/* The controls cast (or undo) without unfolding the row. */}
        <div onClick={(e) => e.stopPropagation()} style={{ display: "flex", gap: "4px", flexShrink: 0 }}>{controls}</div>
      </div>
      {expanded && <SpellDetails slug={row.spell.slug} glossary={glossary} fetchFn={fetchFn} />}
    </div>
  );
}

/** The active creature's spells, in their own section under its actions,
 * each spell folded until the GM opens it for its rules text:
 * every spellcasting entry's spells in one list, highest rank first, then
 * the most actions (see rules/spells.ts's spellRows). Above it, each entry's
 * DC and spell attack, and the Focus Point pool when there is one. Casting
 * enforces PF2's limits — slots, prepared copies, daily uses, Focus Points
 * — and spends the actions it costs; nothing else limits casting several
 * spells in one turn. */
export function SpellList({ combatant, fetchFn }: { combatant: Combatant; fetchFn?: FetchFn }): React.ReactElement | null {
  const t = useT();
  const glossary = useTraitGlossary(fetchFn);
  const lang = useEncounter((s) => s.lang);
  const i18n = useCombatantI18n(combatant);
  // Each spell starts folded; unfolding one shows its full rules text.
  // Which one is unfolded resets when the turn passes to someone else.
  const [expanded, setExpanded] = useState<string | null>(null);
  const [turnOf, setTurnOf] = useState(combatant.id);
  if (turnOf !== combatant.id) {
    setTurnOf(combatant.id);
    setExpanded(null);
  }
  const spellcasting = combatant.spellcasting ?? [];
  if (spellcasting.length === 0) return null;

  const rows = spellRows(spellcasting);
  // Frightened, sickened and stupefied all lower spell attacks and DCs.
  const spellMods = resolveModifiers(conditionModifiers(combatant.conditions, "spell"));
  const castDc = stupefiedCastDc(combatant.conditions);
  const pool = focusPool(spellcasting);
  const focusLeft = pool - (combatant.spellUses?.[FOCUS_KEY] ?? 0);
  const nameOf = (row: SpellRow): string =>
    (lang === "fr" ? i18n?.spells?.[row.flatIndex]?.name : null) ?? row.spell.name;

  return (
    <div data-testid="spell-list">
      <div style={{ fontSize: "11px", letterSpacing: "0.09em", textTransform: "uppercase", color: "var(--text-faint)", marginBottom: "6px" }}>
        {t("SPELLS_HEADING")}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 14px", marginBottom: "8px", fontSize: "11.5px", color: "var(--text-dim)" }}>
        {spellcasting.map((entry, i) => (
          <span
            key={i}
            title={spellMods.applied.map((m) => `${m.value} ${m.source}`).join(", ") || undefined}
            style={{ color: deltaColor(spellMods.total) }}
          >
            <span style={{ fontWeight: 600, color: "var(--text-dim)" }}>{entryLabel(entry, t)}</span>{" "}
            {format(t("SPELL_ENTRY_SUMMARY"), { dc: entry.dc + spellMods.total, attack: signed(entry.attack + spellMods.total) })}
          </span>
        ))}
        {pool > 0 && <span data-testid="focus-points">{format(t("FOCUS_POINTS_LABEL"), { left: Math.max(0, focusLeft), max: pool })}</span>}
      </div>
      {castDc !== null && (
        <div
          data-testid="stupefied-cast-warning"
          style={{ marginBottom: "8px", padding: "6px 10px", borderRadius: "4px", background: "var(--danger-bg)", color: "var(--danger)", fontSize: "12px" }}
        >
          {format(t("STUPEFIED_CAST_WARNING"), { dc: castDc })}
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
        {rows.map((row) => {
          const key = `${row.entryIndex}:${row.spellIndex}`;
          return (
            <SpellRowView
              key={key}
              combatant={combatant}
              row={row}
              name={nameOf(row)}
              showEntry={spellcasting.length > 1}
              expanded={expanded === key}
              onToggle={() => setExpanded((prev) => (prev === key ? null : key))}
              glossary={glossary}
              fetchFn={fetchFn}
            />
          );
        })}
      </div>
    </div>
  );
}
