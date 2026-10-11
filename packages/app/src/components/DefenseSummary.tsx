import { useEncounter } from "../state/store.js";
import { useT } from "../i18n/index.js";
import { CHECKS, CONDITIONS, conditionModifiers, dyingMax } from "../rules/conditions.js";
import { resolveModifiers } from "../rules/modifiers.js";
import { conditionDisplayName, type TraitInfo } from "../rules/traitInfo.js";
import { compareLocalized } from "../rules/compare.js";
import { useTraitGlossary } from "../hooks/useTraitGlossary.js";
import type { Combatant } from "../state/types.js";
import { AcShield } from "./AcShield.js";
import { useConditionTooltip } from "../hooks/useConditionTooltip.js";
import { deltaColor } from "./deltaTone.js";

const HP_TRACK = "var(--hp-track)";
function hpColor(current: number, max: number): string {
  if (max <= 0) return "var(--text-faint)";
  const ratio = current / max;
  if (ratio >= 1) return "var(--ok)";
  if (ratio <= 0.25) return "var(--danger)";
  return "var(--text-dim)";
}

/**
 * Dying is the one condition whose value is measured against a threshold:
 * reaching `dyingMax` (4, less the doomed value) is death, so the chip shows
 * "DYING 2/3" rather than a bare "DYING 2". Without the cap, a PC one point
 * from dead looks exactly like one three points away, and the row flips
 * silently to DEFEATED — the cap was computed in the store and rendered
 * nowhere, which is why it needs the whole condition list here and not just
 * this condition's own value: the number comes from doomed.
 *
 * Every other valued condition keeps its plain value; none of them has a
 * ceiling that means anything.
 */
function conditionLabel(
  c: Combatant["conditions"][number],
  conditions: Combatant["conditions"],
  glossary: Map<string, TraitInfo>,
  lang: "en" | "fr",
): string {
  const def = CONDITIONS[c.slug];
  const name = conditionDisplayName(c.slug, glossary, lang).toUpperCase();
  if (!def.valued) return name;
  if (c.slug === "dying") return `${name} ${c.value}/${dyingMax(conditions)}`;
  return `${name} ${c.value}`;
}

/** Same French condition name RowPopover's own picker/chip resolve
 * (`conditionDisplayName`, shared via rules/traitInfo.js) — otherwise a
 * combatant could show "FRIGHTENED 2" here and "EFFRAYÉ 2" the moment its
 * popover opens, two languages for the one applied condition at once. */
export function ConditionChips({ combatant }: { combatant: Combatant }): React.ReactElement | null {
  const lang = useEncounter((s) => s.lang);
  const glossary = useTraitGlossary();
  const tooltip = useConditionTooltip();
  if (combatant.conditions.length === 0) return null;
  // Alphabetical in the displayed language, same rule and same
  // `compareLocalized` mechanism as RowPopover's own applied-condition
  // group — this is the row's own always-visible rendering of the identical
  // `combatant.conditions` data (the GM reads this one across the whole
  // list without opening any popover), so it gets the same fix rather than
  // staying in insertion order.
  const sorted = [...combatant.conditions].sort((a, b) =>
    compareLocalized(conditionDisplayName(a.slug, glossary, lang), conditionDisplayName(b.slug, glossary, lang), lang),
  );
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", marginTop: "5px" }}>
      {sorted.map((c) => (
        <span
          key={c.slug}
          title={tooltip(c.slug, c.value, { combatant, formula: c.formula })}
          style={{
            cursor: "help",
            fontSize: "10px",
            letterSpacing: "0.04em",
            padding: "1px 5px",
            borderRadius: "2px",
            background: "var(--cond-bg)",
            color: "var(--cond)",
          }}
        >
          {conditionLabel(c, combatant.conditions, glossary, lang)}
        </span>
      ))}
    </div>
  );
}

function HpBar({
  current,
  max,
  width,
  height = 5,
}: {
  current: number;
  max: number;
  /** Fixed width, per Main.dc.html's grouped-member bars (`width: 46px`).
   * Omit it to grow and fill the row instead, per Main.dc.html's
   * standalone-row bar (`flex-grow: 1`) — the bar yields space to the
   * `{current}/{max}` number beside it rather than demanding the full
   * line and shoving that number into the AC/saves column. */
  width?: string;
  height?: number;
}): React.ReactElement {
  const pct = max > 0 ? Math.min(100, Math.max(0, (current / max) * 100)) : 0;
  const sizing =
    width !== undefined ? { width, flexShrink: 0 } : { flexGrow: 1, flexShrink: 1, minWidth: 0 };
  return (
    <div style={{ ...sizing, height: `${height}px`, borderRadius: "3px", background: HP_TRACK, overflow: "hidden" }}>
      <div style={{ width: `${pct}%`, height: "100%", background: hpColor(current, max) }} />
    </div>
  );
}

type Save = "fortitude" | "reflex" | "will";

/** A defence as it stands under the combatant's conditions — a confused or
 * prone target is off-guard (AC −2), a stupefied one has a lower Will save
 * — with what moved it, for the hover text. The roll assistant already
 * rolled against the adjusted AC; this list used to show the printed one. */
function adjusted(combatant: Combatant, check: keyof typeof CHECKS): { total: number; why: string } {
  const result = resolveModifiers(conditionModifiers(combatant.conditions, CHECKS[check]));
  return { total: result.total, why: result.applied.map((m) => `${m.value} ${m.source}`).join(", ") };
}

/** The save's full name (hover, screen reader) and its short form (the
 * visible label: "F"/"R"/"W" in English, "Vig"/"Réf"/"Vol" in French, as
 * the French stat blocks print them). Both go through the catalogue — the
 * short form used to be a hardcoded English letter. */
const SAVE_KEYS = {
  fortitude: { name: "LABEL_FORTITUDE", short: "SAVE_SHORT_FORTITUDE" },
  reflex: { name: "LABEL_REFLEX", short: "SAVE_SHORT_REFLEX" },
  will: { name: "LABEL_WILL", short: "SAVE_SHORT_WILL" },
} as const;

/** Programmatic, not a concatenated literal "+", so a zero or negative save
 * (none exist in the dataset today, but nothing here should assume that
 * stays true) still renders correctly. */
function formatSigned(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`;
}

/** One "F +6" unit: `title` names the save on hover (works without any JS
 * state, per the brief) and `aria-label` gives it an accessible name that
 * includes the signed value too, for anyone relying on a screen reader
 * instead of hover. The letter is bold, the value regular weight, with a
 * tight gap between them (not a full word space) so the pair reads as one
 * unit rather than two words. */
function SaveUnit({ save, value, delta = 0, why = "" }: { save: Save; value: number; delta?: number; why?: string }): React.ReactElement {
  const t = useT();
  const saveName = t(SAVE_KEYS[save].name);
  return (
    <span
      title={why ? `${saveName} (${why})` : saveName}
      aria-label={`${saveName} ${formatSigned(value)}`}
      style={{ whiteSpace: "nowrap", color: deltaColor(delta) }}
    >
      <span style={{ fontWeight: 700 }}>{t(SAVE_KEYS[save].short)}</span>
      <span style={{ marginLeft: "2px" }}>{formatSigned(value)}</span>
    </span>
  );
}

/** ", " (a real comma, then a space) between units — not flex gap, which
 * only spaces them apart without the comma the brief asked for. */
function Saves({ combatant }: { combatant: Combatant }): React.ReactElement {
  const saves = combatant.saves;
  if (saves === null) return <span>—</span>;
  const unit = (save: Save): React.ReactElement => {
    const { total, why } = adjusted(combatant, save);
    return <SaveUnit save={save} value={saves[save] + total} delta={total} why={why} />;
  };
  return (
    <span style={{ whiteSpace: "nowrap" }}>
      {unit("fortitude")}
      {", "}
      {unit("reflex")}
      {", "}
      {unit("will")}
    </span>
  );
}

/** A combatant's defensive side at a glance: HP bar with current/max, AC,
 * the three saves and the conditions on them. It is what the roll
 * assistant's target picker lists each candidate with, and what the chosen
 * target's box shows — the initiative list no longer carries any of it, so
 * this is where the GM reads who is hurt and how hard they are to hit. */
export function DefenseSummary({ combatant }: { combatant: Combatant }): React.ReactElement {
  const t = useT();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "5px", minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        {combatant.ac !== null ? (
          (() => {
            const { total, why } = adjusted(combatant, "ac");
            return (
              <span title={why || undefined} style={{ display: "inline-flex" }}>
                <AcShield ac={combatant.ac + total} size={20} color={deltaColor(total)} />
              </span>
            );
          })()
        ) : (
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "11px", color: "var(--text-dim)" }}>{t("AC_UNKNOWN")}</span>
        )}
        <span style={{ fontFamily: "var(--font-mono)", fontSize: "11px", color: "var(--text-dim)", letterSpacing: "-0.01em" }}>
          <Saves combatant={combatant} />
        </span>
      </div>
      {combatant.hp !== null && (
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <HpBar current={combatant.hp.current} max={combatant.hp.max} />
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "11px", color: "var(--text-dim)", flexShrink: 0, whiteSpace: "nowrap" }}>
            {combatant.hp.current}/{combatant.hp.max}
          </span>
        </div>
      )}
      <ConditionChips combatant={combatant} />
    </div>
  );
}
