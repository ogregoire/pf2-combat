# Initiative, Delay, conditions and players in Quick add

Date: 2026-08-25
Status: approved design, not yet implemented

Four GM-reported changes that share a data model and therefore share one
spec. The four items in the batch that were pure presentation (strike
framing, select-then-Use, the passive strip, the IWR line) shipped
separately in `faa85fe`.

## Problem

1. A combatant with no initiative is written as `0`, which sorts as a real
   value and reads as a real roll.
2. Players who delay their turn cannot be moved in the order at all.
3. Adding a condition is a dropdown, a value box and an Add button —
   three interactions to apply Frightened 1.
4. Players can only reach the initiative order through a button buried in
   the Party drawer, behind the Present checkbox, with its own separate
   initiative field.

## Decisions taken

| Question | Decision |
| --- | --- |
| Delay semantics | RAW. Returning permanently rewrites initiative; the original is kept for reference only |
| Reordering | Delay for the rules case, plus a rules-free manual drag |
| Delay controls | Turn manager, beside Next |
| Initiative modifier | Creature perception; asked once per player and remembered |
| Unrolled initiative | Sorts to the top and blocks advancing the turn |
| Condition picker | Lists all 43 dataset conditions |
| Condition rules | Dying/wounded, doomed capping dying, 0 HP, end-of-turn ticks |
| Players in Quick add | Present and not already added; ranked above creatures |
| Persistence | `SCHEMA_VERSION` stays 1; readers default the new fields |

## 1. Initiative

### Model

`Entry.initiative` becomes `number | null`, where null means "not rolled
yet" — distinct from a genuine roll of 0, which is legal and must keep
sorting where it belongs.

Two fields carry the modifier that turns a die result into an initiative:

- `Combatant.initiativeModifier: number | null`, taken from the creature
  record's `perception` at seed time. `perception` exists on every
  creature record in the dataset but is not currently plumbed into the
  app at all; `seedFromEntry` in `AddCombatants.tsx` is the one place
  that denormalises creature fields onto a combatant, so it goes there
  next to `iwr`, `reactions`, `attacks` and `actions`.
- `Player.initiativeModifier: number | null`, collected once and kept on
  the roster so the next fight reuses it.

The 0-HP rule is a player-character rule. A creature reduced to 0 does
not start dying in this app — it is marked `defeated`, which the row
already renders. `Combatant.kind` decides which path runs.

`Combatant.playerId?: string` links a PC combatant back to the player it
came from. No such link exists today. It is needed here to write a
newly-entered modifier back to the roster, and again in item 4 to know
which players are already in the order.

### Ordering and the advance guard

Unrolled entries sort above everything else, so the GM sees what still
needs a roll rather than having it hidden at the bottom. Advancing the
turn is refused while any entry is unrolled, with a message naming the
count. This is a guard, not a silent skip: a fight where someone never
rolled is a mistake to surface, not to route around.

### Entry in the popover

The popover's existing Initiative field takes the **die result**, not the
total. It renders `roll + mod = total` as the GM types and commits the
total. A PC whose player has no modifier yet gets a one-time inline
prompt for it, which is written back to the roster.

## 2. Delay and manual reordering

### The ordering key

Sorting moves off `initiative` and onto a new `Entry.orderKey: number`.
It starts equal to the initiative and is reset to it whenever an
initiative is set. Sorting is by `orderKey` descending, defaulting to
`orderKey ?? initiative ?? 0` so an entry persisted under the old shape
still sorts sensibly without a schema migration.

One mechanism then serves both features: returning from Delay and
dragging a row both assign the midpoint between the two neighbours the
row lands between. At the ends of the list there is only one neighbour,
so the value is that neighbour's key plus or minus one. Initiative stays the number the GM reads; `orderKey`
is only how placement resolves. This replaces the current reliance on a
stable sort over equal initiatives, which cannot express "after this
one" at all.

### Delay, per RAW

Rules text, Player Core p. 416 (verified against Archives of Nethys, not
recalled):

> You can return to the initiative order as a free action triggered by
> the end of any other creature's turn. This permanently changes your
> initiative to the new position. If you Delay an entire round without
> returning to the initiative order, the actions from the Delayed turn
> are lost, your initiative doesn't change, and your next turn occurs at
> your original position. You can't use reactions until you return to
> the initiative order. When you Delay, any persistent damage or other
> negative effects that normally occur at the start or end of your turn
> occur immediately when you use the Delay action. Any beneficial
> effects that would end at any point during your turn also end.

State: `Entry.delayed: boolean` and `Entry.initiativeBeforeDelay: number
| null`.

Pressing **Delay** (turn manager, beside Next, shown only for the active
entry):

1. Fires every negative start/end-of-turn effect immediately, rather
   than on a turn boundary. This is what stops Delay being a way to
   dodge persistent damage. Note that `startOfTurn` and `endOfTurn` are
   *declared* on `ConditionDef` today but consumed nowhere in the store
   — they are dead declarations, so this work wires them for the first
   time, and Delay is a second caller of that same wiring, not the
   first.
2. Marks the entry delayed, parks the current initiative in
   `initiativeBeforeDelay`, and advances the turn.

**Return** appears on the turn manager whenever a delayed entry exists
and a turn has just ended. It clears `delayed`, sets `initiative` to the
position it returns at — permanently, per RAW — and sets `orderKey` to
the midpoint just below the creature whose turn ended. The parked
original stays on the entry and renders struck-through beside the new
value, so the GM can see what it was without it having any effect.

**Round expiry**: when the round wraps to the delayed entry's original
slot with no Return, the turn's actions are lost, `initiative` and
`orderKey` are restored from `initiativeBeforeDelay`, and `delayed`
clears. The combatant simply gets its next turn in its original place.

**Reactions**: `ReactionWatch` filters on `!c.reactionSpent` today. It
gains the delayed check, so a delayed combatant's reactions are shown
locked rather than offered.

### Manual drag

A drag handle on each row, independent of Delay and carrying no rules:
it sets `orderKey` only, never `initiative`, never `delayed`. This is the
GM override for everything the rules don't cover.

## 3. Conditions

### The picker

The panel keeps the "Add condition" title. Below it, two rows:

- **Applied**, on top: each condition as a tag. A valued one renders
  `Frightened − 1 +`, with small spaces around the number; `−` and `+`
  change the value and never go below 0. Each tag keeps its small `×`.
- **All the rest**, below: every remaining condition from
  `data/conditions.json` as a plain tag. Clicking one applies it, at
  value 1 for valued conditions.

All 43 dataset conditions are pickable. The app currently curates 22 in
`ConditionSlug`; the other 21 are not new or forgotten, they were simply
never modelled.

### Modelling

Every condition with something mechanical to compute gets a real
`ConditionDef`: unconscious, paralyzed, petrified, fleeing, confused,
invisible, concealed, hidden, undetected, encumbered, fascinated and
broken join the existing 22.

The five attitude conditions — friendly, helpful, indifferent,
unfriendly, hostile — are pickable and tracked but carry no `affects`,
because they describe an NPC's disposition and change no number in a
fight.

### Linked rules

All four live in `rules/conditions.ts` as pure functions over an
`AppliedCondition[]` (plus HP where needed), and are wired at named call
sites in `state/store.ts`. Naming the call sites is part of the spec:
this codebase has shipped rules that were written but never invoked.

| Rule | Function | Call site |
| --- | --- | --- |
| Gaining dying while wounded N adds N | `dyingOnGain` | `addCondition` |
| Losing dying raises wounded by 1 | `woundedOnRecover` | `removeCondition` |
| Dying max is 4 − doomed; reaching it is death | `dyingMax` | `addCondition`, and the dying display |
| A PC at 0 HP gains dying 1 and unconscious; a creature is marked defeated | `onDroppedToZero` | `applyDamage` |
| Healing above 0 clears dying | `onHealedAboveZero` | `applyHealing` |
| Frightened decrements, persistent damage rolls | `applyEndOfTurn` (new; `endOfTurn` is declared but consumed nowhere today) | turn advance, and Delay |

## 4. Players in Quick add

Quick add's option list becomes a union of players and creature index
entries. Present players who are not already in the order are listed on
focus, before any typing — the roster is small and the GM wants to see
who is missing. Once the query is non-empty, matching players rank above
every creature match. A player already in the order does not appear.

`PartyManager`'s per-player Initiative field and "Add to encounter"
button are both removed. Quick add becomes the only way in, and the
drawer returns to being the roster it was.

Players arrive with `initiative: null`, so this depends on item 1.

## Sequencing

1. **Item 1** — nullable initiative, `orderKey`, modifier plumbing,
   `playerId`. Everything else builds on it.
2. **Item 4** — players in Quick add. Small once item 1 exists.
3. **Item 2** — Delay. Needs `orderKey`.
4. **Item 3** — conditions. Independent of the other three; can move
   earlier if it is the bigger table pain.

## Testing

jsdom performs no layout and no hit-testing, and has twice passed this
app's tests while a real browser was broken (the clipped popover in
`97ebb88`, the dead hover gap in `620d7d1`). So:

- Rules functions (`dyingOnGain`, `dyingMax`, `orderKey` placement) get
  ordinary unit tests — they are pure and jsdom is irrelevant to them.
- Store wiring gets tests that assert the call site fires, not just that
  the function exists. The repeated defect in this codebase is rules that
  are written and never invoked.
- Anything positional — the drag handle, the delayed row's struck-through
  initiative, the condition tag rows — is verified in a real browser
  before the work is called done, and pinned in jsdom only as a style
  contract.

## Out of scope

- `ActionPips` renders "1 actions". Pre-existing, unrelated, noted only
  so it is not mistaken for new.
- Regeneration deactivators (a troll's acid) never reach the damage
  popover. Real gap, separately raised, not part of this batch.
