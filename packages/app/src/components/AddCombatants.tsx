import { useEffect, useState } from "react";
import type { Creature, IndexEntry } from "@pf2/schema";
import { resolveCollisions, searchCreatures } from "../data/catalog.js";
import { loadCreature } from "../data/creatures.js";
import { loadIndexI18n, loadMergedIndexI18n, localizeEntries, type IndexI18n } from "../data/i18nOverlay.js";
import { format, useT } from "../i18n/index.js";
import { compareStrings } from "../rules/compare.js";
import type { Iwr } from "../rules/damage.js";
import { totalInitiative } from "../rules/initiative.js";
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

/** Builds the seed for a combatant added from the catalog. `entry` must be
 * the RAW, unlocalized catalog entry — never the French-named copy the
 * search results render — so `name` is always stored in English; the
 * French name is resolved at render time (see `useCombatantI18n`, driven
 * off `creatureId`), never baked into the stored combatant. `creature` is
 * only present once `loadCreature` has resolved, so a null creature still
 * yields a valid seed with the four denormalised fields left empty, same
 * as any other seed. No `i18n` parameter: no production caller has one to
 * pass (the render layer resolves it from `creatureId` instead), and a
 * test that wants to seed one directly can still set `CombatantSeed.i18n`
 * on the result — see e.g. french-creature.test.tsx, which does exactly
 * that without going through this function at all. */
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
    // A creature's Perception is its initiative modifier — PF2e always
    // rolls initiative with Perception unless the GM calls for a different
    // skill, which this app doesn't model. Null (not the four fields'
    // "empty" state) when no creature record has loaded yet, since there's
    // no reasonable default for a number the GM will roll against.
    initiativeModifier: creature?.perception ?? null,
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
  loadIndexI18nFn = loadIndexI18n,
}: {
  entries: IndexEntry[];
  loadCreatureFn?: (id: string) => Promise<Creature>;
  loadIndexI18nFn?: (pack: string) => Promise<IndexI18n>;
}): React.ReactElement {
  const t = useT();
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState("1");
  const [initiative, setInitiative] = useState("");
  const [actThisRound, setActThisRound] = useState(false);
  const [loadedCreature, setLoadedCreature] = useState<Creature | null>(null);
  const [creatureLoading, setCreatureLoading] = useState(false);
  const [indexI18n, setIndexI18n] = useState<IndexI18n>({});

  const round = useEncounter((s) => s.encounter.round);
  const encounterEntries = useEncounter((s) => s.encounter.entries);
  const activeEntryIndex = useEncounter((s) => s.encounter.activeEntryIndex);
  const addCombatant = useEncounter((s) => s.addCombatant);
  const addMany = useEncounter((s) => s.addMany);
  const lang = useEncounter((s) => s.lang);

  // The catalog's own index files are English-only; the French names come
  // from a per-pack overlay (see i18nOverlay.js) fetched and merged here,
  // only when French is on — same rule as the per-creature overlay fetched
  // in `select` below.
  useEffect(() => {
    if (lang !== "fr") {
      setIndexI18n({});
      return;
    }
    let cancelled = false;
    loadMergedIndexI18n(entries, loadIndexI18nFn).then((merged) => {
      if (!cancelled) setIndexI18n(merged);
    });
    return () => {
      cancelled = true;
    };
  }, [lang, entries, loadIndexI18nFn]);

  const resolved = resolveCollisions(entries);
  const localized = localizeEntries(resolved, indexI18n, lang);
  const results = searchCreatures(localized, query);
  const shownResults = results.slice(0, RESULT_CAP);
  const hiddenCount = results.length - shownResults.length;
  const selected = localized.find((e) => e.id === selectedId) ?? null;

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

  // A blank field means "not rolled yet", same as QuickAdd — not a 0.
  const typedInitiative = initiative.trim() === "" ? null : Number(initiative) || 0;

  // This drawer only ever adds a creature (a PC comes in through Quick add
  // instead), so the typed field is always a d20 result the GM just
  // rolled — the app totals it with the selected creature's own modifier
  // before it's stored or compared against the active entry below. Same
  // rule as the row popover's commitInitiative — see rules/initiative.ts's
  // totalInitiative, its one home. Computed here (off `loadedCreature`
  // directly, not the seed built inside handleAdd) so `willActNextRound`
  // below can read it too, not just the add itself.
  const committedInitiative =
    typedInitiative === null ? null : totalInitiative("creature", typedInitiative, loadedCreature?.perception ?? null);

  const handleAdd = (): void => {
    if (!selected) return;
    // The RAW (unlocalized) entry, not `selected` — `selected` carries the
    // French name when `lang` is "fr", and the stored combatant must always
    // carry the English one (see seedFromEntry).
    const rawSelected = resolved.find((e) => e.id === selectedId);
    if (!rawSelected) return;
    const qty = Math.max(1, Math.trunc(Number(quantity)) || 1);
    const seed = seedFromEntry(rawSelected, loadedCreature);

    // "act this round instead": the combatant's turn-order slot is lowered
    // just enough to still be reached this round, but the GM's totalled
    // initiative is never overwritten — it's parked as trueInitiative and
    // restored (see store.nextTurn) the moment the round wraps. Every
    // comparison here uses committedInitiative (die result + modifier), not
    // the raw typed roll — a roll that sits below the active entry's
    // initiative can still total above it once the modifier is added, and a
    // mid-round add has to slot by the number that actually decides turn
    // order. An active entry with no initiative rolled yet is treated as a 0
    // for this comparison — there's no real value to measure against. An
    // unrolled newcomer (committedInitiative null) can't be "acting early"
    // either — there is no numeric value to compare or to restore later —
    // so it always falls through to the plain (null) slot, which already
    // sorts above everything.
    const activeInitiative = activeEntry?.initiative ?? 0;
    let slotInitiative = committedInitiative;
    let trueInitiative: number | undefined;
    if (
      committedInitiative !== null &&
      actThisRound &&
      activeEntry !== undefined &&
      committedInitiative > activeInitiative
    ) {
      slotInitiative = Math.min(committedInitiative, activeInitiative);
      trueInitiative = committedInitiative;
    }

    if (qty === 1) addCombatant(seed, slotInitiative, trueInitiative);
    else addMany(seed, qty, slotInitiative, trueInitiative);
    clearSelection();
  };

  const willActNextRound =
    running &&
    activeEntry !== undefined &&
    committedInitiative !== null &&
    committedInitiative > (activeEntry.initiative ?? 0) &&
    !actThisRound;

  const qtyForLabel = Math.max(1, Math.trunc(Number(quantity)) || 1);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: "12px" }}>
        <h2 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: "22px", fontWeight: 600 }}>
          {t("ADD_COMBATANTS_TITLE")}
        </h2>
        {running && (
          <span style={{ fontSize: "12px", color: "var(--text-faint)" }}>
            {format(t("ENCOUNTER_RUNNING_ROUND"), { round })}
          </span>
        )}
      </div>

      <input
        aria-label={t("SEARCH_CREATURES_ARIA")}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t("SEARCH_CREATURES_PLACEHOLDER")}
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
        {results.length} {results.length === 1 ? t("MATCH_SINGULAR") : t("MATCH_PLURAL")}
        {hiddenCount > 0 && format(t("MATCH_HIDDEN_SUFFIX"), { shown: shownResults.length })}
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
                        {t("REMASTER_BADGE")}
                      </span>
                    </>
                  ) : (
                    <span style={{ fontSize: "11.5px", color: "var(--text-faint)" }}>
                      {entry.book} &middot; {t("LEGACY_LABEL")}
                    </span>
                  )}
                </div>
              </div>

              <div style={{ display: "flex", gap: "20px", fontFamily: "var(--font-mono)", fontSize: "13px" }}>
                <span>
                  {t("LABEL_AC")} <span style={{ fontWeight: 600 }}>{entry.ac}</span>
                </span>
                <span>
                  {t("LABEL_HP")} <span style={{ fontWeight: 600 }}>{entry.hp}</span>
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
                    aria-label={format(t("FEWER_NAME_ARIA"), { name: entry.name })}
                    onClick={() => setQuantity(String(Math.max(1, qtyForLabel - 1)))}
                    style={{ ...addButtonStyle, borderRadius: "4px 0 0 4px", width: "34px", height: "34px" }}
                  >
                    &minus;
                  </button>
                  <input
                    aria-label={t("QUANTITY_ARIA")}
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
                    aria-label={format(t("MORE_NAME_ARIA"), { name: entry.name })}
                    onClick={() => setQuantity(String(qtyForLabel + 1))}
                    style={{ ...addButtonStyle, borderRadius: "0 4px 4px 0", width: "34px", height: "34px" }}
                  >
                    +
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  aria-label={format(t("ADD_NAME_ARIA"), { name: entry.name })}
                  onClick={() => select(entry)}
                  style={addButtonStyle}
                >
                  {t("LABEL_ADD")}
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
              {t("LABEL_INITIATIVE")}
            </span>
            <input
              aria-label={t("LABEL_INITIATIVE")}
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
              {t("CREATURE_LOADING")}
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
                {format(t("SLOT_PASSED_PREFIX"), { slot: committedInitiative })} <strong>{t("NEXT_ROUND_BOLD")}</strong>
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
                {t("ACT_THIS_ROUND_BUTTON")}
              </button>
            </div>
          )}

          <div style={{ flexGrow: 1 }} />

          {/* Disabled while `creatureLoading`: clicking Add before the
             record resolves has always meant losing that creature's saves,
             IWR and attacks (seedFromEntry falls back to empty ones — see
             above), but a typed initiative is now also a d20 result the app
             totals against `loadedCreature`'s own Perception, so an early
             click would additionally commit that roll un-added-to, with no
             way for the GM to tell it apart from a creature that genuinely
             has no Perception on record. Same disabled-button idiom as
             RowPopover's Damage/Heal buttons (there: `combatant.hp ===
             null`) rather than a guard inside handleAdd — the button is the
             only way to reach it, so disabling it is sufficient. */}
          <button
            type="button"
            disabled={creatureLoading}
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
              cursor: creatureLoading ? "default" : "pointer",
              opacity: creatureLoading ? 0.5 : 1,
            }}
          >
            {t("LABEL_ADD")} {qtyForLabel} {pluralize(selected.name, qtyForLabel)}
          </button>
        </div>
      )}
    </div>
  );
}
