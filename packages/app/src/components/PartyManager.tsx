import { useState } from "react";
import { useEncounter } from "../state/store.js";
import type { Player } from "../state/types.js";
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

const fieldStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "3px",
  fontSize: "10px",
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "var(--text-faint)",
};

const inputStyle: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: "14px",
  padding: "7px 8px",
  borderRadius: "3px",
  border: "1px solid var(--border-strong)",
  background: "var(--bg)",
  color: "var(--text)",
};

/** No mockup owns this panel — the GM doesn't own player sheets, but the
 * roll assistant needs a target's AC and three saves to compute anything
 * against a PC, so those four numbers are captured here once per player.
 * Styled from tokens.css to match the rest of the app. */
export function PartyManager(): React.ReactElement {
  const players = useEncounter((s) => s.players);
  const setPlayers = useEncounter((s) => s.setPlayers);
  const addCombatant = useEncounter((s) => s.addCombatant);
  const clearPlayers = useEncounter((s) => s.clearPlayers);

  // Draft initiative per player, entered here and consumed by "Add to
  // encounter" below — this is the only place a kind:"pc" combatant is ever
  // constructed, carrying the player's AC and saves onto it so the roll
  // assistant can compute against them (the entire reason those are
  // collected here in the first place).
  const [initiatives, setInitiatives] = useState<Record<string, string>>({});

  const addToEncounter = (p: Player): void => {
    const initiative = Number(initiatives[p.id]) || 0;
    addCombatant(
      {
        kind: "pc",
        name: p.name,
        hp: p.hp !== undefined ? { current: p.hp, max: p.hp } : null,
        ac: p.ac,
        saves: p.saves,
        level: p.level,
      },
      initiative,
    );
    setInitiatives((prev) => ({ ...prev, [p.id]: "" }));
  };

  const update = (id: string, patch: Partial<Player>): void => {
    setPlayers(players.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  };

  const updateSave = (id: string, save: keyof Player["saves"], value: number): void => {
    setPlayers(players.map((p) => (p.id === id ? { ...p, saves: { ...p.saves, [save]: value } } : p)));
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
        <h2 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: "20px", fontWeight: 600 }}>Party</h2>
        <button
          type="button"
          onClick={() => setPlayers([...players, emptyPlayer()])}
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
          Add player
        </button>

        <div style={{ flexGrow: 1 }} />

        {/* Empties the roster, and — since a cleared roster and a PC still
           sitting in the initiative order would disagree about who's
           playing — also removes any `kind: "pc"` combatant already in the
           encounter (see clearPlayers in the store). */}
        <ConfirmButton
          label="Clear players"
          confirmMessage={`Clear ${players.length} ${players.length === 1 ? "player" : "players"}? Also removes any of them already in the initiative order.`}
          onConfirm={clearPlayers}
          disabled={players.length === 0}
        />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
        {players.map((p) => (
          <div
            key={p.id}
            style={{
              display: "flex",
              alignItems: "flex-end",
              gap: "12px",
              padding: "12px 14px",
              borderRadius: "4px",
              border: "1px solid var(--border)",
              background: "var(--panel)",
            }}
          >
            <label style={{ ...fieldStyle, flexGrow: 1 }}>
              Name
              <input
                aria-label="Name"
                value={p.name}
                onChange={(e) => update(p.id, { name: e.target.value })}
                style={{ ...inputStyle, fontFamily: "var(--font-ui)" }}
              />
            </label>

            <label style={{ ...fieldStyle, width: "56px" }}>
              Level
              <input
                aria-label="Level"
                value={numDisplay(p.level)}
                onChange={(e) => update(p.id, { level: toNumber(e.target.value) })}
                style={inputStyle}
              />
            </label>

            <label style={{ ...fieldStyle, width: "56px" }}>
              AC
              <input
                aria-label="AC"
                value={numDisplay(p.ac)}
                onChange={(e) => update(p.id, { ac: toNumber(e.target.value) })}
                style={inputStyle}
              />
            </label>

            <label style={{ ...fieldStyle, width: "56px" }}>
              HP
              <input
                aria-label="HP"
                value={hpDisplay(p.hp)}
                onChange={(e) => update(p.id, { hp: toOptionalNumber(e.target.value) })}
                style={inputStyle}
              />
            </label>

            <label style={{ ...fieldStyle, width: "64px" }}>
              Fortitude
              <input
                aria-label="Fortitude"
                value={numDisplay(p.saves.fortitude)}
                onChange={(e) => updateSave(p.id, "fortitude", toNumber(e.target.value))}
                style={inputStyle}
              />
            </label>

            <label style={{ ...fieldStyle, width: "64px" }}>
              Reflex
              <input
                aria-label="Reflex"
                value={numDisplay(p.saves.reflex)}
                onChange={(e) => updateSave(p.id, "reflex", toNumber(e.target.value))}
                style={inputStyle}
              />
            </label>

            <label style={{ ...fieldStyle, width: "64px" }}>
              Will
              <input
                aria-label="Will"
                value={numDisplay(p.saves.will)}
                onChange={(e) => updateSave(p.id, "will", toNumber(e.target.value))}
                style={inputStyle}
              />
            </label>

            <label style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "var(--text-dim)", paddingBottom: "7px" }}>
              <input
                type="checkbox"
                aria-label="Present"
                checked={p.present}
                onChange={() => update(p.id, { present: !p.present })}
              />
              Present
            </label>

            {p.present && (
              <>
                <label style={{ ...fieldStyle, width: "56px" }}>
                  Initiative
                  <input
                    aria-label={`Initiative for ${p.name.trim() === "" ? "player" : p.name}`}
                    value={initiatives[p.id] ?? ""}
                    onChange={(e) => setInitiatives((prev) => ({ ...prev, [p.id]: e.target.value }))}
                    style={inputStyle}
                  />
                </label>
                <button
                  type="button"
                  onClick={() => addToEncounter(p)}
                  style={{
                    fontFamily: "inherit",
                    fontSize: "12px",
                    padding: "7px 10px",
                    borderRadius: "3px",
                    border: "1px solid var(--border-strong)",
                    background: "var(--accent-bg)",
                    color: "var(--accent-text)",
                    cursor: "pointer",
                    marginBottom: "1px",
                  }}
                >
                  Add to encounter
                </button>
              </>
            )}

            <button
              type="button"
              aria-label={`Remove ${p.name.trim() === "" ? "player" : p.name}`}
              onClick={() => setPlayers(players.filter((other) => other.id !== p.id))}
              style={{
                fontFamily: "inherit",
                fontSize: "12px",
                padding: "7px 10px",
                borderRadius: "3px",
                border: "1px solid var(--border)",
                background: "var(--panel-raised)",
                color: "var(--text-dim)",
                cursor: "pointer",
                marginBottom: "1px",
              }}
            >
              Remove
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
