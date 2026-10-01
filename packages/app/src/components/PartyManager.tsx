import { useEffect, useRef, useState } from "react";
import { format, useT } from "../i18n/index.js";
import { useEncounter } from "../state/store.js";
import type { Player } from "../state/types.js";
import { NARROW_LAYOUT_QUERY, useMediaQuery } from "../hooks/useMediaQuery.js";
import { AcShield } from "./AcShield.js";
import { ConfirmButton } from "./ConfirmButton.js";

/** Local to this module — player ids never need to interleave with
 * combatant/entry ids from the store, just stay unique and non-random so a
 * persisted party is reproducible, same reasoning as the store's own
 * combatantSeq/entrySeq. */
let playerSeq = 0;
function nextPlayerId(): string {
  playerSeq += 1;
  return `player${playerSeq}`;
}

/** Same defect as the store's combatantSeq/entrySeq (see
 * store.ts:restoreCombatantSequences): a page reload resets this
 * module-level counter to 0 while IndexedDB still holds players numbered
 * higher, so the next "Add player" would mint a colliding id. Called once
 * after persisted players load — see main.tsx. */
export function restorePlayerSequence(players: Player[]): void {
  for (const p of players) {
    const n = Number(p.id.replace(/^player/, ""));
    if (Number.isFinite(n) && n > playerSeq) playerSeq = n;
  }
}

function emptyPlayer(): Player {
  return {
    id: nextPlayerId(),
    name: "",
    level: 0,
    ac: 0,
    saves: { fortitude: 0, reflex: 0, will: 0 },
    present: true,
    // Players roll their own initiative, so the roster has no field for
    // this; it only ever gets filled in from the row popover's reminder.
    initiativeModifier: null,
  };
}

/** A fresh player's numeric fields start at 0, which would make typing a
 * value append onto a visible "0" instead of replacing it. Rendering 0 as
 * an empty field sidesteps that without a separate draft-string per input. */
function numDisplay(n: number): string {
  return n === 0 ? "" : String(n);
}

function toNumber(raw: string): number {
  return raw.trim() === "" ? 0 : Number(raw) || 0;
}

/** Unlike the other numeric fields, HP is genuinely optional — an empty
 * field means "unknown", not zero, so a blank input must map back to
 * `undefined`, not 0. This is the fix for HP never having a field at all:
 * every PC seeded from PartyManager got `hp: null`, so the row popover's
 * Damage/Heal buttons silently did nothing against them. */
function toOptionalNumber(raw: string): number | undefined {
  return raw.trim() === "" ? undefined : Number(raw) || 0;
}

function hpDisplay(hp: number | undefined): string {
  return hp === undefined ? "" : String(hp);
}

function formatSigned(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`;
}

/** The editable fields of one row, in the order Tab and Enter walk them. */
const FIELD_ORDER = ["name", "ac", "level", "hp", "fortitude", "reflex", "will"] as const;
type FieldKey = (typeof FIELD_ORDER)[number];

function nextField(key: FieldKey, direction: 1 | -1): FieldKey | null {
  return FIELD_ORDER[FIELD_ORDER.indexOf(key) + direction] ?? null;
}

const captionStyle: React.CSSProperties = {
  fontSize: "10px",
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "var(--text-faint)",
};

/** Display button and input share one height, so swapping one for the
 * other — the AC shield for a text box, say — never moves the row. */
const FIELD_HEIGHT = "32px";

const inputStyle: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: "14px",
  height: FIELD_HEIGHT,
  padding: "0 6px",
  borderRadius: "3px",
  border: "1px solid var(--select)",
  background: "var(--panel-raised)",
  color: "var(--text)",
  outline: "none",
};

/** The Present toggle and the bin: borderless square icon buttons that sit
 * outside the wrapping field area, one at each end of the row, vertically
 * centred whatever the fields wrap to. */
const iconButtonStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: "30px",
  height: "30px",
  padding: 0,
  borderRadius: "3px",
  border: "1px solid transparent",
  background: "transparent",
  cursor: "pointer",
  flexShrink: 0,
  alignSelf: "center",
  justifySelf: "center",
};

/** Values are monospaced and right-aligned in a fixed number of character
 * cells, so "+9" and "+10" — or level 4 and level 12 — line up from one
 * row to the next instead of nudging everything after them sideways. */
function valueStyle(cells: number): React.CSSProperties {
  return {
    fontFamily: "var(--font-mono)",
    fontSize: "14px",
    fontWeight: 600,
    width: `${cells}ch`,
    textAlign: "right",
    display: "inline-block",
  };
}

/** The at-rest face of a field: plain text in a borderless button, so the
 * roster reads as a list of players rather than a form. Clicking (or
 * focusing and pressing Enter) swaps it for the input. */
const displayButtonStyle: React.CSSProperties = {
  fontFamily: "inherit",
  fontSize: "inherit",
  display: "inline-flex",
  alignItems: "center",
  gap: "6px",
  height: FIELD_HEIGHT,
  padding: "0 6px",
  margin: 0,
  borderRadius: "3px",
  border: "1px solid transparent",
  background: "transparent",
  color: "var(--text)",
  cursor: "text",
  textAlign: "left",
};

/**
 * One value of the player row, shown as text until clicked, then as an
 * input until the GM leaves it. The row owns which field is open
 * (`editing`), so that Enter and Tab from the input can open the next
 * field directly rather than just dropping focus on it — the GM fills a
 * new player in one pass without reaching for the mouse. Shift+Tab walks
 * back; Escape and a click elsewhere close the field where it is.
 *
 * Edits commit on every keystroke, as the old always-on inputs did, so
 * closing the field never loses anything.
 */
function InlineField({
  fieldKey,
  label,
  value,
  onChange,
  editing,
  setEditing,
  display,
  inputWidth,
  mono = true,
}: {
  fieldKey: FieldKey;
  label: string;
  value: string;
  onChange: (raw: string) => void;
  editing: FieldKey | null;
  setEditing: (next: FieldKey | null) => void;
  /** What the field looks like at rest. */
  display: React.ReactNode;
  inputWidth: string;
  mono?: boolean;
}): React.ReactElement {
  const t = useT();
  const inputRef = useRef<HTMLInputElement>(null);
  const open = editing === fieldKey;

  useEffect(() => {
    if (open) inputRef.current?.select();
  }, [open]);

  if (!open) {
    return (
      <button
        type="button"
        aria-label={label}
        title={t("CLICK_TO_EDIT_TITLE")}
        onClick={() => setEditing(fieldKey)}
        style={displayButtonStyle}
      >
        {display}
      </button>
    );
  }

  return (
    <input
      ref={inputRef}
      autoFocus
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={() => {
        // Only close if this is still the open field: a Tab/Enter that
        // already opened the next field must not be undone by the blur
        // that follows as this input unmounts.
        if (editing === fieldKey) setEditing(null);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === "Tab") {
          const next = nextField(fieldKey, e.shiftKey ? -1 : 1);
          // Off either end of the row, a Tab keeps its native meaning and
          // moves focus on out of the row; Enter simply closes the field.
          if (next !== null || e.key === "Enter") e.preventDefault();
          setEditing(next);
        } else if (e.key === "Escape") {
          setEditing(null);
        }
      }}
      style={{ ...inputStyle, width: inputWidth, fontFamily: mono ? "var(--font-mono)" : "var(--font-ui)", fontSize: mono ? "14px" : "17px" }}
    />
  );
}

function CheckIcon(): React.ReactElement {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <path d="M4.5 8.2 7 10.6 11.6 5.6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CrossIcon(): React.ReactElement {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <path d="M5.3 5.3l5.4 5.4M10.7 5.3l-5.4 5.4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function DotsIcon(): React.ReactElement {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <circle cx="4" cy="9" r="1.6" fill="currentColor" />
      <circle cx="9" cy="9" r="1.6" fill="currentColor" />
      <circle cx="14" cy="9" r="1.6" fill="currentColor" />
    </svg>
  );
}

/** The roster's overflow menu — a "⋯" button that drops down the actions
 * too destructive or too rare to deserve a button of their own. Only
 * "Clear characters" lives here for now. Closes on a click outside, on
 * Escape, or once the action inside has run. */
function OverflowMenu({ children }: { children: (close: () => void) => React.ReactNode }): React.ReactElement {
  const t = useT();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e: MouseEvent): void => {
      if (rootRef.current !== null && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} style={{ position: "relative" }}>
      <button
        type="button"
        aria-label={t("MORE_ACTIONS_ARIA")}
        aria-haspopup="menu"
        aria-expanded={open}
        title={t("MORE_ACTIONS_ARIA")}
        onClick={() => setOpen((prev) => !prev)}
        style={{
          ...iconButtonStyle,
          width: "34px",
          height: "34px",
          border: "1px solid var(--border-strong)",
          background: "var(--panel-raised)",
          color: "var(--text-dim)",
        }}
      >
        <DotsIcon />
      </button>
      {open && (
        <div
          role="menu"
          style={{
            position: "absolute",
            right: 0,
            bottom: "calc(100% + 6px)",
            minWidth: "240px",
            padding: "4px",
            borderRadius: "5px",
            border: "1px solid var(--border-strong)",
            background: "var(--panel-raised)",
            boxShadow: "0 8px 24px var(--shadow)",
            zIndex: 1,
          }}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

function TrashIcon(): React.ReactElement {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M2.5 4h11M6.5 4V2.5h3V4M4 4l.7 9.5h6.6L12 4M6.5 6.5v5M9.5 6.5v5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PlayerRow({
  player: p,
  narrow,
  startEditingName,
  onChange,
  onRemove,
}: {
  player: Player;
  narrow: boolean;
  /** A row for a character just added opens its Name field at once, so
   * "Add character" leaves the GM typing the name rather than hunting for
   * the new row. */
  startEditingName: boolean;
  onChange: (patch: Partial<Player>) => void;
  onRemove: () => void;
}): React.ReactElement {
  const t = useT();
  const [editing, setEditing] = useState<FieldKey | null>(startEditingName ? "name" : null);

  const save = (key: "fortitude" | "reflex" | "will", label: string): React.ReactElement => (
    <InlineField
      fieldKey={key}
      label={label}
      value={numDisplay(p.saves[key])}
      onChange={(raw) => onChange({ saves: { ...p.saves, [key]: toNumber(raw) } })}
      editing={editing}
      setEditing={setEditing}
      inputWidth="44px"
      display={
        <>
          <span style={captionStyle}>{label}</span>
          <span style={valueStyle(3)}>{formatSigned(p.saves[key])}</span>
        </>
      }
    />
  );

  return (
    <div
      data-testid="player-row"
      style={{
        // Columns come from the roster's grid (see PartyManager), so every
        // row's AC, Level, HP and saves sit in the same columns whatever
        // the names' lengths — a flex row wrapped its saves to a second
        // line on a long name alone, and nothing lined up any more.
        display: "grid",
        gridTemplateColumns: "subgrid",
        gridColumn: "1 / -1",
        alignItems: "center",
        columnGap: "10px",
        rowGap: "2px",
        // No horizontal padding: a subgrid's padding eats into its first
        // and last tracks, which squeezed the bin against the edge. The
        // icon columns are 46px — 30px button plus 8px air each side — so
        // the toggle and the bin sit at the same distance from their edges.
        padding: "6px 0",
        borderRadius: "4px",
        border: "1px solid var(--border)",
        background: "var(--panel)",
      }}
    >
      {/* Present: a green check, or a red cross for a character sitting
         this session out. A button in the checkbox role, so it still reads
         and toggles as one. */}
      <button
        type="button"
        role="checkbox"
        aria-checked={p.present}
        aria-label={t("LABEL_PRESENT")}
        title={t("LABEL_PRESENT")}
        onClick={() => onChange({ present: !p.present })}
        style={{ ...iconButtonStyle, gridColumn: 1, gridRow: "1 / -1", color: p.present ? "var(--ok)" : "var(--danger)" }}
      >
        {p.present ? <CheckIcon /> : <CrossIcon />}
      </button>

      <div style={{ display: "flex", alignItems: "center", minWidth: 0 }}>
          <InlineField
            fieldKey="name"
            label={t("LABEL_NAME")}
            value={p.name}
            onChange={(raw) => onChange({ name: raw })}
            editing={editing}
            setEditing={setEditing}
            inputWidth="100%"
            mono={false}
            display={
              p.name.trim() === "" ? (
                <span style={{ fontSize: "17px", fontStyle: "italic", color: "var(--text-faint)" }}>{t("NAME_UNSET_PLACEHOLDER")}</span>
              ) : (
                <span style={{ fontSize: "17px", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>
              )
            }
          />
        </div>

        <InlineField
          fieldKey="ac"
          label={t("LABEL_AC")}
          value={numDisplay(p.ac)}
          onChange={(raw) => onChange({ ac: toNumber(raw) })}
          editing={editing}
          setEditing={setEditing}
          inputWidth="44px"
          display={<AcShield ac={p.ac} size={22} />}
        />

        <InlineField
          fieldKey="level"
          label={t("LABEL_LEVEL")}
          value={numDisplay(p.level)}
          onChange={(raw) => onChange({ level: toNumber(raw) })}
          editing={editing}
          setEditing={setEditing}
          inputWidth="44px"
          display={
            <>
              <span style={captionStyle}>{t("LABEL_LEVEL")}</span>
              <span style={valueStyle(2)}>{p.level}</span>
            </>
          }
        />

        <InlineField
          fieldKey="hp"
          label={t("LABEL_HP")}
          value={hpDisplay(p.hp)}
          onChange={(raw) => onChange({ hp: toOptionalNumber(raw) })}
          editing={editing}
          setEditing={setEditing}
          inputWidth="52px"
          display={
            <>
              <span style={captionStyle}>{t("LABEL_HP")}</span>
              <span style={{ ...valueStyle(3), color: p.hp === undefined ? "var(--text-faint)" : "var(--text)" }}>
                {p.hp === undefined ? "—" : p.hp}
              </span>
            </>
          }
        />

      {/* The three saves are one block: on a narrow screen the whole block
         moves to a second line under the other fields, never splitting
         Will from Fortitude; the toggle and the bin span both lines. */}
      <div
        data-testid="saves-block"
        style={{
          display: "flex",
          alignItems: "center",
          gap: "2px",
          flexWrap: "nowrap",
          gridColumn: narrow ? "2 / 6" : undefined,
        }}
      >
        {save("fortitude", t("LABEL_FORTITUDE"))}
        {save("reflex", t("LABEL_REFLEX"))}
        {save("will", t("LABEL_WILL"))}
      </div>

      <button
        type="button"
        aria-label={format(t("REMOVE_NAME_ARIA"), { name: p.name.trim() === "" ? t("PLAYER_SINGULAR") : p.name })}
        title={t("LABEL_REMOVE")}
        onClick={onRemove}
        style={{ ...iconButtonStyle, gridColumn: -2, gridRow: "1 / -1", color: "var(--danger)" }}
      >
        <TrashIcon />
      </button>
    </div>
  );
}

/** No mockup owns this panel — the GM doesn't own player sheets, but the
 * roll assistant needs a target's AC and three saves to compute anything
 * against a PC, so those four numbers are captured here once per player.
 * Styled from tokens.css to match the rest of the app. */
export function PartyManager(): React.ReactElement {
  const t = useT();
  const players = useEncounter((s) => s.players);
  const setPlayers = useEncounter((s) => s.setPlayers);
  const clearPlayers = useEncounter((s) => s.clearPlayers);
  const narrow = useMediaQuery(NARROW_LAYOUT_QUERY);
  const [newId, setNewId] = useState<string | null>(null);

  const update = (id: string, patch: Partial<Player>): void => {
    setPlayers(players.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  };

  const addCharacter = (): void => {
    const added = emptyPlayer();
    setNewId(added.id);
    setPlayers([...players, added]);
  };

  return (
    // Fills the drawer's column and lets the roster, not the drawer, be the
    // part that scrolls when the party outgrows the screen; the footer's
    // Add/Clear controls stay put beneath it.
    <div style={{ display: "flex", flexDirection: "column", gap: "12px", flex: "1 1 auto", minHeight: 0 }}>
      {/* One grid for the whole roster, so its columns — toggle, name, AC,
         level, HP, saves, bin — are sized once across every row and the
         values line up down the list. Each row is a subgrid of it. */}
      <div
        data-testid="roster"
        style={{
          display: "grid",
          gridTemplateColumns: narrow
            ? "46px minmax(0, 1fr) auto auto auto 46px"
            : "46px minmax(140px, 1fr) auto auto auto auto 46px",
          rowGap: "8px",
          alignItems: "center",
          alignContent: "start",
          overflowY: "auto",
          minHeight: 0,
          flex: "1 1 auto",
        }}
      >
        {players.map((p) => (
          <PlayerRow
            key={p.id}
            player={p}
            narrow={narrow}
            startEditingName={p.id === newId}
            onChange={(patch) => update(p.id, patch)}
            onRemove={() => setPlayers(players.filter((other) => other.id !== p.id))}
          />
        ))}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "12px", flexShrink: 0 }}>
        <button
          type="button"
          onClick={addCharacter}
          style={{
            fontFamily: "inherit",
            fontSize: "12.5px",
            padding: "7px 13px",
            borderRadius: "4px",
            border: "1px solid var(--border-strong)",
            background: "var(--panel-raised)",
            color: "var(--text)",
            cursor: "pointer",
          }}
        >
          {t("ADD_PLAYER_BUTTON")}
        </button>

        <div style={{ flexGrow: 1 }} />

        {/* Empties the roster, and — since a cleared roster and a PC still
           sitting in the initiative order would disagree about who's
           playing — also removes any `kind: "pc"` combatant already in the
           encounter (see clearPlayers in the store). Behind the "⋯" so it
           can't be hit by accident, and it still asks first, inline. */}
        <OverflowMenu>
          {(close) => (
            <ConfirmButton
              label={t("CLEAR_PLAYERS_LABEL")}
              confirmMessage={format(t("CLEAR_PLAYERS_CONFIRM"), {
                n: players.length,
                word: players.length === 1 ? t("PLAYER_SINGULAR") : t("PLAYER_PLURAL"),
              })}
              onConfirm={() => {
                close();
                clearPlayers();
              }}
              disabled={players.length === 0}
              tone="menu"
            />
          )}
        </OverflowMenu>
      </div>
    </div>
  );
}
