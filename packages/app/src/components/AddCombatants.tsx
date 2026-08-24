import { useState } from "react";
import type { Creature, IndexEntry } from "@pf2/schema";
import { resolveCollisions, searchCreatures } from "../data/catalog.js";
import { loadCreature } from "../data/creatures.js";
import { compareStrings } from "../rules/compare.js";
import type { Iwr } from "../rules/damage.js";
import { useEncounter } from "../state/store.js";
import type { CombatantSeed } from "../state/store.js";

/**
 * The four fields `Combatant` carries but no producer has populated yet
 * (`iwr`, `reactions`, `attacks`, `actions`) all come from the full
 * `Creature` record, not the lightweight `IndexEntry` search results. This
 * is the one place that denormalises them onto a `CombatantSeed` — every
 * other consumer (the damage popover, reaction watch, roll assistant) just
 * reads what's already on the combatant.
 */
function toIwr(creature: Creature): Iwr {
  return {
    immunities: creature.immunities.map((i) => i.type),
    weaknesses: creature.weaknesses.map((w) => ({ type: w.type, value: w.value, exceptions: w.exceptions })),
    resistances: creature.resistances.map((r) => ({ type: r.type, value: r.value, exceptions: r.exceptions })),
  };
}

/** Reactions are just actions costed "reaction" — a trigger-less one (rare)
 * shows its name alone downstream, per ReactionWatch, so an absent trigger
 * becomes "" rather than null. */
function toReactions(creature: Creature): { name: string; trigger: string }[] {
  return creature.actions
    .filter((a) => a.cost === "reaction")
    .map((a) => ({ name: a.name, trigger: a.trigger ?? "" }));
}

/** Builds the seed for a combatant added from the catalog. `entry` (AC, HP,
 * level, name) is always available; `creature` is only present once
 * `loadCreature` has resolved, so a null creature still yields a valid seed
 * with the four denormalised fields left empty, same as any other seed. */
export function seedFromEntry(entry: IndexEntry, creature: Creature | null): CombatantSeed {
  return {
    kind: "creature",
    name: entry.name,
    creatureId: entry.id,
    hp: { current: entry.hp, max: entry.hp },
    ac: entry.ac,
    saves:
      creature !== null
        ? {
            fortitude: creature.saves.fortitude.value,
            reflex: creature.saves.reflex.value,
            will: creature.saves.will.value,
          }
        : null,
    level: entry.level,
    iwr: creature !== null ? toIwr(creature) : null,
    reactions: creature !== null ? toReactions(creature) : [],
    attacks: creature !== null ? creature.attacks : [],
    actions: creature !== null ? creature.actions : [],
  };
}

// An empty query matches the whole 1443-creature dataset; rendering every
// row froze the drawer for no GM benefit — nobody reads past the first
// screenful before narrowing the search. Capped, with a count of what's
// hidden so it's clear the rest exists rather than having vanished.
const RESULT_CAP = 50;

function pluralize(name: string, quantity: number): string {
  return quantity === 1 ? name : `${name}s`;
}

const rowStyle = (selected: boolean): React.CSSProperties => ({
  display: "flex",
  alignItems: "center",
  gap: "16px",
  padding: "13px 16px",
  borderRadius: "4px",
  background: selected ? "var(--accent-bg)" : "var(--panel)",
  border: `1px solid ${selected ? "var(--border-strong)" : "var(--border)"}`,
});

const addButtonStyle: React.CSSProperties = {
  fontFamily: "inherit",
  fontSize: "12.5px",
  padding: "8px 15px",
  borderRadius: "4px",
  border: "1px solid var(--border-strong)",
  background: "var(--panel-raised)",
  color: "var(--text)",
  cursor: "pointer",
};

/** AddCombatants.dc.html: search the resolved catalog, pick a creature and
 * a quantity, optionally set an initiative, and add. `loadCreatureFn` is
 * injectable for tests; production callers rely on the default, which
 * fetches and caches the real creature record. */
export function AddCombatants({
  entries,
  loadCreatureFn = loadCreature,
}: {
  entries: IndexEntry[];
  loadCreatureFn?: (id: string) => Promise<Creature>;
}): React.ReactElement {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState("1");
  const [initiative, setInitiative] = useState("");
  const [actThisRound, setActThisRound] = useState(false);
  const [loadedCreature, setLoadedCreature] = useState<Creature | null>(null);
  const [creatureLoading, setCreatureLoading] = useState(false);

  const round = useEncounter((s) => s.encounter.round);
  const encounterEntries = useEncounter((s) => s.encounter.entries);
  const activeEntryIndex = useEncounter((s) => s.encounter.activeEntryIndex);
  const addCombatant = useEncounter((s) => s.addCombatant);
  const addMany = useEncounter((s) => s.addMany);

  const resolved = resolveCollisions(entries);
  const results = searchCreatures(resolved, query);
  const shownResults = results.slice(0, RESULT_CAP);
  const hiddenCount = results.length - shownResults.length;
  const selected = resolved.find((e) => e.id === selectedId) ?? null;

  const running = encounterEntries.length > 0;
  const activeEntry = running ? encounterEntries[activeEntryIndex] : undefined;

  const select = (entry: IndexEntry): void => {
    setSelectedId(entry.id);
    setQuantity("1");
    setInitiative("");
    setActThisRound(false);
    setLoadedCreature(null);
    setCreatureLoading(true);
    loadCreatureFn(entry.id)
      .then((creature) => setLoadedCreature(creature))
      .catch(() => setLoadedCreature(null))
      .finally(() => setCreatureLoading(false));
  };

  const clearSelection = (): void => {
    setSelectedId(null);
    setLoadedCreature(null);
    setCreatureLoading(false);
    setQuantity("1");
    setInitiative("");
    setActThisRound(false);
  };

  const handleAdd = (): void => {
    if (!selected) return;
    const qty = Math.max(1, Math.trunc(Number(quantity)) || 1);
    const typedInitiative = Number(initiative) || 0;
    const seed = seedFromEntry(selected, loadedCreature);

    // "act this round instead": the combatant's turn-order slot is lowered
    // just enough to still be reached this round, but the GM's typed
    // initiative is never overwritten — it's parked as trueInitiative and
    // restored (see store.nextTurn) the moment the round wraps.
    const actingEarly = actThisRound && activeEntry !== undefined && typedInitiative > activeEntry.initiative;
    const slotInitiative = actingEarly ? Math.min(typedInitiative, activeEntry!.initiative) : typedInitiative;
    const trueInitiative = actingEarly ? typedInitiative : undefined;

    if (qty === 1) addCombatant(seed, slotInitiative, trueInitiative);
    else addMany(seed, qty, slotInitiative, trueInitiative);
    clearSelection();
  };

  const typedInitiative = initiative.trim() === "" ? null : Number(initiative) || 0;
  const willActNextRound =
    running &&
    activeEntry !== undefined &&
    typedInitiative !== null &&
    typedInitiative > activeEntry.initiative &&
    !actThisRound;

  const qtyForLabel = Math.max(1, Math.trunc(Number(quantity)) || 1);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: "12px" }}>
        <h2 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: "22px", fontWeight: 600 }}>
          Add combatants
        </h2>
        {running && (
          <span style={{ fontSize: "12px", color: "var(--text-faint)" }}>encounter is running &mdash; round {round}</span>
        )}
      </div>

      <input
        aria-label="Search creatures"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search creatures…"
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "14px",
          padding: "9px 12px",
          borderRadius: "4px",
          border: "1px solid var(--border-strong)",
          background: "var(--panel)",
          color: "var(--text)",
        }}
      />

      <div style={{ fontSize: "11px", letterSpacing: "0.09em", textTransform: "uppercase", color: "var(--text-faint)" }}>
        {results.length} match{results.length === 1 ? "" : "es"}
        {hiddenCount > 0 && ` — showing ${shownResults.length}, refine your search to see the rest`}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        {shownResults.map((entry) => {
          const isSelected = selectedId === entry.id;
          return (
            <div key={entry.id} style={rowStyle(isSelected)}>
              <div style={{ width: "210px" }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: "8px" }}>
                  <span style={{ fontSize: "15px", fontWeight: 600 }}>{entry.name}</span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: "13px", color: "var(--accent-text)" }}>
                    {entry.level}
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "3px" }}>
                  {entry.remaster ? (
                    <>
                      <span style={{ fontSize: "11.5px", color: "var(--text-faint)" }}>{entry.book}</span>
                      <span
                        style={{
                          fontSize: "9.5px",
                          fontWeight: 600,
                          letterSpacing: "0.06em",
                          padding: "1px 5px",
                          borderRadius: "2px",
                          background: "var(--ok-bg)",
                          color: "var(--ok)",
                        }}
                      >
                        REMASTER
                      </span>
                    </>
                  ) : (
                    <span style={{ fontSize: "11.5px", color: "var(--text-faint)" }}>{entry.book} &middot; legacy</span>
                  )}
                </div>
              </div>

              <div style={{ display: "flex", gap: "20px", fontFamily: "var(--font-mono)", fontSize: "13px" }}>
                <span>
                  AC <span style={{ fontWeight: 600 }}>{entry.ac}</span>
                </span>
                <span>
                  HP <span style={{ fontWeight: 600 }}>{entry.hp}</span>
                </span>
              </div>

              <div style={{ display: "flex", gap: "4px" }}>
                {[...entry.traits].sort(compareStrings).map((t) => (
                  <span
                    key={t}
                    style={{
                      fontSize: "10px",
                      letterSpacing: "0.05em",
                      padding: "2px 6px",
                      borderRadius: "2px",
                      background: "var(--border)",
                      color: "var(--text-dim)",
                    }}
                  >
                    {t.toUpperCase()}
                  </span>
                ))}
              </div>

              <div style={{ flexGrow: 1 }} />

              {isSelected ? (
                <div style={{ display: "flex", alignItems: "center", gap: "0" }}>
                  <button
                    type="button"
                    aria-label={`Fewer ${entry.name}`}
                    onClick={() => setQuantity(String(Math.max(1, qtyForLabel - 1)))}
                    style={{ ...addButtonStyle, borderRadius: "4px 0 0 4px", width: "34px" }}
                  >
                    &minus;
                  </button>
                  <input
                    aria-label="Quantity"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    style={{
                      width: "46px",
                      height: "34px",
                      textAlign: "center",
                      fontFamily: "var(--font-mono)",
                      fontSize: "16px",
                      fontWeight: 600,
                      border: "1px solid var(--border-strong)",
                      borderLeft: "none",
                      borderRight: "none",
                      background: "var(--bg)",
                      color: "var(--text)",
                    }}
                  />
                  <button
                    type="button"
                    aria-label={`More ${entry.name}`}
                    onClick={() => setQuantity(String(qtyForLabel + 1))}
                    style={{ ...addButtonStyle, borderRadius: "0 4px 4px 0", width: "34px" }}
                  >
                    +
                  </button>
                </div>
              ) : (
                <button type="button" aria-label={`Add ${entry.name}`} onClick={() => select(entry)} style={addButtonStyle}>
                  Add
                </button>
              )}
            </div>
          );
        })}
      </div>

      {selected && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "14px",
            padding: "14px 16px",
            borderRadius: "4px",
            border: "1px solid var(--border)",
            background: "var(--panel-raised)",
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "9px" }}>
            <span style={{ fontSize: "11px", letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-faint)" }}>
              Initiative
            </span>
            <input
              aria-label="Initiative"
              value={initiative}
              onChange={(e) => setInitiative(e.target.value)}
              style={{
                width: "62px",
                fontFamily: "var(--font-mono)",
                fontSize: "16px",
                fontWeight: 600,
                textAlign: "center",
                padding: "7px 6px",
                borderRadius: "3px",
                border: "1px solid var(--border-strong)",
                background: "var(--bg)",
                color: "var(--text)",
              }}
            />
          </div>

          {creatureLoading && (
            <span data-testid="creature-loading" style={{ fontSize: "11.5px", color: "var(--text-faint)" }}>
              loading creature record&hellip;
            </span>
          )}

          {willActNextRound && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "7px 12px",
                borderRadius: "4px",
                background: "var(--info-bg)",
                border: "1px solid var(--border-strong)",
              }}
            >
              <span style={{ fontSize: "12.5px", color: "var(--info)" }}>
                Slot {typedInitiative} has passed &mdash; acts <strong>next round</strong>
              </span>
              <button
                type="button"
                onClick={() => setActThisRound(true)}
                style={{
                  fontFamily: "inherit",
                  fontSize: "11.5px",
                  padding: "3px 9px",
                  borderRadius: "3px",
                  border: "1px solid var(--border-strong)",
                  background: "var(--panel)",
                  color: "var(--info)",
                  cursor: "pointer",
                }}
              >
                act this round instead
              </button>
            </div>
          )}

          <div style={{ flexGrow: 1 }} />

          <button
            type="button"
            onClick={handleAdd}
            style={{
              fontFamily: "inherit",
              fontSize: "13.5px",
              fontWeight: 600,
              padding: "10px 22px",
              borderRadius: "4px",
              border: "1px solid var(--border-strong)",
              background: "var(--accent-bg)",
              color: "var(--accent-text)",
              cursor: "pointer",
            }}
          >
            Add {qtyForLabel} {pluralize(selected.name, qtyForLabel)}
          </button>
        </div>
      )}
    </div>
  );
}
