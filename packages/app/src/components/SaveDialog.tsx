import { useEffect, useState } from "react";
import { resolveCreatureName } from "../data/i18nOverlay.js";
import { useCombatantI18n } from "../hooks/useCombatantI18n.js";
import { format, useT, type StringKey } from "../i18n/index.js";
import { CHECKS } from "../rules/conditions.js";
import { applyIwr, damageTypeName, DAMAGE_TYPES } from "../rules/damage.js";
import { degreeOf, type Degree } from "../rules/degrees.js";
import { rollFormula } from "../rules/dice.js";
import { modifiersFor } from "../rules/effects.js";
import { resolveModifiers } from "../rules/modifiers.js";
import { basicSaveDamage, DEGREES, degreeFaces } from "../rules/saves.js";
import { useEncounter } from "../state/store.js";
import type { Combatant, SaveRequest } from "../state/types.js";
import { deltaColor } from "./deltaTone.js";
import { hover, modifiersHover } from "./HoverCard.js";

const SAVE_KEY = { fortitude: "LABEL_FORTITUDE", reflex: "LABEL_REFLEX", will: "LABEL_WILL" } as const;
const DEGREE_KEY: Record<Degree, StringKey> = {
  "critical-success": "SAVE_CRIT_SUCCESS", success: "SAVE_SUCCESS", failure: "SAVE_FAILURE", "critical-failure": "SAVE_CRIT_FAILURE",
};
const DEGREE_SHORT_KEY: Record<Degree, StringKey> = {
  "critical-success": "SAVE_CRIT_SUCCESS_SHORT", success: "SAVE_SUCCESS_SHORT", failure: "SAVE_FAILURE_SHORT", "critical-failure": "SAVE_CRIT_FAILURE_SHORT",
};
const DEGREE_COLOR: Record<Degree, string> = {
  "critical-success": "var(--ok)", success: "var(--ok)", failure: "var(--danger)", "critical-failure": "var(--danger)",
};
const signed = (n: number): string => (n >= 0 ? `+${n}` : `−${Math.abs(n)}`);

const field: React.CSSProperties = {
  fontFamily: "inherit",
  fontSize: "13px",
  padding: "5px 7px",
  borderRadius: "3px",
  border: "1px solid var(--border-strong)",
  background: "var(--bg)",
  color: "var(--text)",
};
const button: React.CSSProperties = { ...field, cursor: "pointer", background: "var(--panel-raised)" };

/** Whether `c` is on the other side from `caster`: creatures against the
 * party, the party against creatures. */
const opposes = (c: Combatant, caster: Combatant | undefined): boolean =>
  caster === undefined ? true : (c.kind === "pc") !== (caster.kind === "pc");

/**
 * A saving throw against every creature it reaches — a spell's area, an
 * aura, a breath weapon: each target's save as it stands (conditions and
 * bonuses applied), the chance of each degree, its roll (typed, or rolled
 * here), the degree it gives and, for a basic save, the damage it takes
 * after its resistances and weaknesses. Apply deals it to them all.
 */
export function SaveDialog(): React.ReactElement | null {
  const request = useEncounter((s) => s.saveRequest);
  if (!request) return null;
  return <SaveDialogBody request={request} />;
}

function SaveDialogBody({ request }: { request: SaveRequest }): React.ReactElement {
  const t = useT();
  const lang = useEncounter((s) => s.lang);
  const combatants = useEncounter((s) => s.encounter.combatants);
  const entries = useEncounter((s) => s.encounter.entries);
  const closeSaveDialog = useEncounter((s) => s.closeSaveDialog);
  const applyDamage = useEncounter((s) => s.applyDamage);
  const caster = request.casterId ? combatants[request.casterId] : undefined;
  const ordered = entries.flatMap((e) => e.combatantIds).map((id) => combatants[id]!).filter((c) => c && c.id !== request.casterId);

  const [save, setSave] = useState(request.save);
  const [dc, setDc] = useState(request.dc === null ? "" : String(request.dc));
  const [basic, setBasic] = useState(request.basic);
  const [damage, setDamage] = useState("");
  const [formula, setFormula] = useState(request.damageFormula ?? "");
  const [damageType, setDamageType] = useState(request.damageType && DAMAGE_TYPES.has(request.damageType) ? request.damageType : "none");
  const [selected, setSelected] = useState<Set<string>>(() => new Set(ordered.filter((c) => !c.defeated && opposes(c, caster)).map((c) => c.id)));
  const [rolls, setRolls] = useState<Record<string, string>>({});

  useEffect(() => {
    const key = (e: KeyboardEvent): void => {
      if (e.key === "Escape") closeSaveDialog();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [closeSaveDialog]);

  const dcValue = /^\d+$/.test(dc) ? Number(dc) : null;
  const amount = /^\d+$/.test(damage) ? Number(damage) : null;
  const saveOf = (c: Combatant): { mod: number; delta: number; hover: string | null } | null => {
    if (!c.saves) return null;
    const mods = resolveModifiers(modifiersFor(c, CHECKS[save]));
    const mod = c.saves[save] + mods.total;
    return { mod, delta: mods.total, hover: modifiersHover(`${t(SAVE_KEY[save])} ${signed(mod)}`, mods.applied) };
  };
  const degreeFor = (c: Combatant): Degree | null => {
    const face = Number(rolls[c.id]);
    const s = saveOf(c);
    if (!s || dcValue === null || !Number.isInteger(face) || Math.min(Math.max(face, 1), 20) !== face) return null;
    return degreeOf(face + s.mod, dcValue, face);
  };
  const damageFor = (c: Combatant, degree: Degree | null): number | null => {
    if (!basic || amount === null || degree === null) return null;
    return applyIwr(basicSaveDamage(amount, degree), damageType, c.iwr);
  };
  const targets = ordered.filter((c) => selected.has(c.id));
  const rollAll = (): void => {
    const next = { ...rolls };
    for (const c of targets) if (!next[c.id] && c.kind !== "pc") next[c.id] = String(Math.floor(Math.random() * 20) + 1);
    setRolls(next);
  };
  const ready = targets.filter((c) => damageFor(c, degreeFor(c)) !== null && c.hp !== null);

  return (
    <div style={{ position: "fixed", inset: 0, background: "var(--scrim)", display: "flex", justifyContent: "center", alignItems: "center", padding: "16px", zIndex: 65 }}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="save-dialog-title"
        style={{ width: "min(760px, 100%)", maxHeight: "calc(100vh - 32px)", overflowY: "auto", background: "var(--panel-raised)", border: "1px solid var(--border-strong)", borderRadius: "8px", boxShadow: "0 16px 48px var(--shadow)", padding: "18px 20px", display: "flex", flexDirection: "column", gap: "14px" }}
      >
        <h2 id="save-dialog-title" style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: "19px" }}>
          {request.label ? format(t("SAVE_DIALOG_TITLE_FOR"), { label: request.label }) : t("SAVE_DIALOG_TITLE")}
        </h2>

        <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", alignItems: "center", fontSize: "13px" }}>
          <select aria-label={t("SAVE_TYPE_ARIA")} value={save} onChange={(e) => setSave(e.target.value as typeof save)} style={field}>
            {(["fortitude", "reflex", "will"] as const).map((s) => (
              <option key={s} value={s}>
                {t(SAVE_KEY[s])}
              </option>
            ))}
          </select>
          <label style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}>
            {t("SAVE_DC_LABEL")}
            <input aria-label={t("SAVE_DC_LABEL")} inputMode="numeric" value={dc} onChange={(e) => setDc(e.target.value.trim())} style={{ ...field, width: "52px" }} />
          </label>
          <label style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}>
            <input type="checkbox" checked={basic} onChange={(e) => setBasic(e.target.checked)} />
            {t("SAVE_BASIC_LABEL")}
          </label>
          {basic && (
            <>
              <label style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}>
                {t("SAVE_DAMAGE_LABEL")}
                <input aria-label={t("SAVE_DAMAGE_LABEL")} inputMode="numeric" value={damage} onChange={(e) => setDamage(e.target.value.trim())} style={{ ...field, width: "56px" }} />
              </label>
              <input aria-label={t("SAVE_FORMULA_ARIA")} value={formula} onChange={(e) => setFormula(e.target.value)} style={{ ...field, width: "72px", fontFamily: "var(--font-mono)" }} />
              <button
                type="button"
                disabled={rollFormula(formula.replace(/\s+/g, "")) === null}
                onClick={() => {
                  const rolled = rollFormula(formula.replace(/\s+/g, ""));
                  if (rolled !== null) setDamage(String(rolled));
                }}
                style={button}
              >
                {t("SAVE_ROLL_DAMAGE")}
              </button>
              <select aria-label={t("SAVE_DAMAGE_TYPE_ARIA")} value={damageType} onChange={(e) => setDamageType(e.target.value)} style={field}>
                <option value="none">{t("SAVE_DAMAGE_UNTYPED")}</option>
                {[...DAMAGE_TYPES].filter((d) => !d.endsWith("-damage")).map((d) => (
                  <option key={d} value={d}>
                    {damageTypeName(d, lang)}
                  </option>
                ))}
              </select>
            </>
          )}
        </div>

        <table style={{ borderCollapse: "collapse", fontSize: "13px", width: "100%" }}>
          <thead>
            <tr style={{ fontSize: "10.5px", letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-faint)", textAlign: "left" }}>
              <th />
              <th style={{ padding: "4px" }}>{t("SAVE_COL_TARGET")}</th>
              <th style={{ padding: "4px" }}>{t(SAVE_KEY[save])}</th>
              <th style={{ padding: "4px" }}>{t("SAVE_COL_CHANCES")}</th>
              <th style={{ padding: "4px" }}>{t("SAVE_COL_ROLL")}</th>
              <th style={{ padding: "4px" }}>{t("SAVE_COL_RESULT")}</th>
            </tr>
          </thead>
          <tbody>
            {ordered.map((c) => (
              <SaveRow
                key={c.id}
                combatant={c}
                checked={selected.has(c.id)}
                onToggle={() => {
                  const next = new Set(selected);
                  if (next.has(c.id)) next.delete(c.id);
                  else next.add(c.id);
                  setSelected(next);
                }}
                save={saveOf(c)}
                dc={dcValue}
                roll={rolls[c.id] ?? ""}
                onRoll={(v) => setRolls({ ...rolls, [c.id]: v })}
                degree={degreeFor(c)}
                damage={damageFor(c, degreeFor(c))}
              />
            ))}
          </tbody>
        </table>

        <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end", flexWrap: "wrap" }}>
          <button type="button" onClick={rollAll} disabled={dcValue === null} style={button}>
            {t("SAVE_ROLL_ALL")}
          </button>
          {basic && (
            <button
              type="button"
              disabled={ready.length === 0}
              onClick={() => {
                for (const c of ready) {
                  const raw = basicSaveDamage(amount!, degreeFor(c)!);
                  if (raw > 0) applyDamage(c.id, raw, damageType);
                }
                closeSaveDialog();
              }}
              style={{ ...button, background: ready.length > 0 ? "var(--danger)" : "var(--panel)", color: ready.length > 0 ? "var(--bg)" : "var(--text-faint)", borderColor: ready.length > 0 ? "var(--danger)" : "var(--border)" }}
            >
              {format(t("SAVE_APPLY_DAMAGE"), { n: ready.length })}
            </button>
          )}
          <button type="button" onClick={closeSaveDialog} style={button}>
            {t("LABEL_CLOSE")}
          </button>
        </div>
      </div>
    </div>
  );
}

function SaveRow({
  combatant,
  checked,
  onToggle,
  save,
  dc,
  roll,
  onRoll,
  degree,
  damage,
}: {
  combatant: Combatant;
  checked: boolean;
  onToggle: () => void;
  save: { mod: number; delta: number; hover: string | null } | null;
  dc: number | null;
  roll: string;
  onRoll: (v: string) => void;
  degree: Degree | null;
  damage: number | null;
}): React.ReactElement {
  const t = useT();
  const lang = useEncounter((s) => s.lang);
  const i18n = useCombatantI18n(combatant);
  const name = resolveCreatureName(combatant.name, i18n, lang);
  const faces = save && dc !== null ? degreeFaces(save.mod, dc) : null;
  return (
    <tr data-testid="save-row" style={{ borderTop: "1px solid var(--border)", opacity: checked ? 1 : 0.5 }}>
      <td style={{ padding: "6px 4px" }}>
        <input type="checkbox" aria-label={name} checked={checked} onChange={onToggle} />
      </td>
      <td style={{ padding: "6px 4px", fontWeight: 600 }}>{name}</td>
      <td style={{ padding: "6px 4px", fontFamily: "var(--font-mono)", color: save ? deltaColor(save.delta) : "var(--text-faint)" }} {...hover(save?.hover)}>
        {save ? signed(save.mod) : "—"}
      </td>
      <td style={{ padding: "6px 4px", fontSize: "11.5px", color: "var(--text-dim)" }}>
        {faces &&
          DEGREES.map((d) => (
            <span key={d} {...hover(t(DEGREE_KEY[d]))} style={{ marginRight: "8px", whiteSpace: "nowrap" }}>
              <span style={{ color: DEGREE_COLOR[d], fontWeight: 600 }}>{t(DEGREE_SHORT_KEY[d])}</span> {faces[d] * 5}%
            </span>
          ))}
      </td>
      <td style={{ padding: "6px 4px", whiteSpace: "nowrap" }}>
        {checked && (
          <>
            <input
              aria-label={format(t("SAVE_ROLL_ARIA"), { name })}
              inputMode="numeric"
              value={roll}
              onChange={(e) => onRoll(e.target.value.trim())}
              style={{ ...field, width: "40px", padding: "3px 5px" }}
            />{" "}
            <button type="button" aria-label={format(t("SAVE_ROLL_ONE_ARIA"), { name })} onClick={() => onRoll(String(Math.floor(Math.random() * 20) + 1))} style={{ ...button, padding: "3px 6px" }}>
              {t("SAVE_COL_ROLL")}
            </button>
          </>
        )}
      </td>
      <td style={{ padding: "6px 4px" }} data-testid="save-result">
        {checked && degree && (
          <span style={{ color: DEGREE_COLOR[degree], fontWeight: 600 }}>
            {t(DEGREE_KEY[degree])}
            {damage !== null && <span style={{ color: "var(--danger)" }}>{` · ${format(t("SAVE_DAMAGE_TAKEN"), { n: damage })}`}</span>}
          </span>
        )}
      </td>
    </tr>
  );
}
