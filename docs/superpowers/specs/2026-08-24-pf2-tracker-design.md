# PF2 Combat Tracker — Design

**Date:** 2026-08-24
**Status:** Approved
**Sub-project:** 2 of 3 (data pipeline · tracker app · rules engine)

## Purpose

A GM-facing combat tracker for Pathfinder 2e, used at an in-person table.

The GM runs Pathfinder Kingmaker (10th Anniversary Edition) with Remastered
rules. Foundry VTT is not used at the table; dice are rolled physically and
positioning is handled on a physical board. The tracker exists so the GM can
keep track of initiative order, creature stat blocks, action economy, and the
conditions players inflict on creatures.

Deployed to GitHub Pages at `ogregoire.be/pf2-combat-tracker` (repository
`github.com/ogregoire/pf2-combat`). Static hosting, no backend.

## Non-goals

- **No dice rolling.** Every number is typed in by the GM.
- **No positioning or maps.** Position-relative states (flanking, flanked,
  cover) are manual toggles reflecting the physical board.
- **Not a player tool.** Single-user, GM-only.

## Stack

TypeScript + Vite + React.

### State management — Zustand + Immer, not Redux

Encounter state is a single tree mutated by many small operations (apply
damage, tick a condition, spend an action). Two properties matter: selector-
scoped subscriptions, so applying damage to one goblin does not re-render
twenty combatant rows; and low ceremony. Redux Toolkit would work but adds
slice and provider boilerplate to buy middleware and time-travel debugging that
this application does not need.

The store is deliberately thin. **All rules live in a dependency-free `rules/`
module of pure functions.** The store calls into it. This is what makes the
difficult logic unit-testable without React, and what would make replacing
Zustand cheap if that ever became desirable.

## Visual direction

Dark, warm near-black ground with an ember accent, chosen for a dimly lit table.
Spectral for display, IBM Plex Sans for UI, IBM Plex Mono for every number —
tabular figures matter when AC, HP and initiative are read at a glance. Approved
against a light, table-dense alternative.

## Layout

Three panes.

- **Left** — combatant list
- **Centre** — active combatant
- **Right** (narrower) — turn manager

## Component tree

```
<EncounterScreen>
├─ <CombatantList>            left
│  ├─ <CombatantRow>          name, HP, AC, Fort/Ref/Will, condition chips
│  └─ <GroupHeader>           collapsible, group initiative
├─ <ActiveCombatant>          centre
│  ├─ <StatBlockHeader>       level, traits, size, rarity, source book
│  ├─ <DefensesPanel>         AC, saves, immunities/weaknesses/resistances
│  ├─ <ActionList>            limited-use actions first, then by cost
│  │  └─ <ActionCard>         cost pips, traits, trigger, frequency,
│  │                          disabled when unaffordable
│  ├─ <SpellcastingPanel>
│  └─ <AttacksPanel>          multiple attack penalty aware
├─ <TurnManager>              right, narrow
│  ├─ <ActionEconomyPips>     3 pips, adjusted by slowed/stunned/quickened
│  ├─ <NextCombatantButton>   becomes prominent at 0 remaining actions
│  ├─ <RoundCounter>
│  └─ <ReactionWatch>         combatants with an unspent reaction, with
│                             trigger text
└─ <DamageConditionBar>       numeric entry, condition picker
```

Supporting screens and widgets:

- `<PartyManager>` — roster, per-player level, present/absent toggles
- `<AddCombatants>` — book filter, name search, **quantity field**
- `<GroupBuilder>` — multi-select combatants into a group
- `<DifficultyBadge>` — dual difficulty rating

Component decomposition is a requirement, not an aesthetic preference: no
single component owns the whole encounter.

## Data loading

`books.json` provides the catalog. The GM enables the books in use; the tracker
fetches only those `index/<pack>.json` files. Full creature records are fetched
lazily when a creature is added to an encounter.

Name collisions between an enabled legacy book and an enabled remaster book are
resolved **in favour of the remaster entry**. The losing entry remains
reachable by explicit id, and is excluded from default search results. Because
resolution happens over the *active* book set, the outcome depends on which
books the GM enabled.

Search results display the source book, so a Kingmaker encounter citing a
Bestiary 1 stat block remains findable under the name the book prints — e.g.
"Troll — Bestiary 1 (legacy)" distinct from "Forest Troll — Monster Core".

## Party and encounter difficulty

### Party

A party is a persisted roster of players, each with a name and level. Each
player has a **present** toggle, since difficulty must reflect who is actually
at the table.

Players carry **name, level, AC, Fortitude, Reflex and Will**, entered once in
the roster, plus per-encounter initiative and conditions. HP stays optional —
players track their own — so the HP cell may render empty.

This reverses an earlier decision that PCs were light entries with no defences.
The roll assistant (below) computes outcomes against a target's AC or save DC;
without those four numbers it would go blank precisely when a monster attacks a
PC, which is most of the time. Four numbers per player, entered once, is the
price of the whole workflow.

### Party level

Derived per GM Core, *Group Parity and Party Level*:

> "Use the highest level if only one or two characters are behind, or an
> average if everyone is at a different level."
>
> "If only one character is two or more levels ahead, use a party level
> suitable for the lower-level characters, and adjust the encounters as if
> there were one additional PC for every 2 levels the higher-level character
> has beyond the rest of the party."

Algorithm, evaluated in this order:

1. **One character far ahead.** If exactly one present character is two or more
   levels above every other present character, party level is the highest level
   among the *remaining* characters, and effective party size gains one
   additional PC per 2 full levels of excess. Stop here.
2. **Most of the party level.** Otherwise, if at most two present characters are
   below the highest present level, party level is the **highest** level.
3. **Otherwise**, party level is the **average** of present character levels.

Effective party size feeds the per-character budget adjustment, so an extra PC
from rule 1 raises the XP budget exactly as a fifth player would.

The rules do not specify rounding for the average. The tracker therefore
computes a value, **displays its derivation** (e.g. "4 present, levels 3/4/4/5
→ 3 behind top → average = 4"), and leaves the field editable.

### Budget

From GM Core, *Building Encounters*.

| Threat | XP budget | Per-character adjustment |
|---|---|---|
| Trivial | 40 | 10 |
| Low | 60 | 20 |
| Moderate | 80 | 20 |
| Severe | 120 | 30 |
| Extreme | 160 | 40 |

Creature XP by level relative to party level:

| Δ | −4 | −3 | −2 | −1 | 0 | +1 | +2 | +3 | +4 |
|---|---|---|---|---|---|---|---|---|---|
| XP | 10 | 15 | 20 | 30 | 40 | 60 | 80 | 120 | 160 |

### Dual rating and the XP award

Difficulty is computed continuously against **both** a standard party of four
and the **actually present** party, displayed side by side — e.g.
"Extreme (party of 4) · Over Extreme (3 present)". Budgets are computed but not
displayed; the rating is the useful output.

Beside them sits the **XP award per character**, which is *not* adjusted for
party size. GM Core, XP Awards: "each character gains XP equal to the total XP
of the creatures and hazards in the encounter (this excludes XP adjustments for
different party sizes)"; Party Size: "the XP awards don't change—always award
the amount of XP listed for a group of four characters." So the award is the
plain sum of creature XP, identical whether three or four players are at the
table. Party size changes the budget, and therefore the rating — which is
exactly why the two badges can disagree while the XP does not.

The rating counts **every creature added to the encounter, including defeated
ones**, since that is the XP budget actually spent. Defeated creatures grey out
in the combatant list but remain in the rating.

## Initiative order

The order is a list of **entries**. An entry is either a single combatant or a
**group** sharing one initiative value. Groups exist so the GM can handle a
wave at a time — e.g. one goblin chief plus three goblins acting together.

Initiative values are typed in by the GM.

### Mid-combat roster changes

Adding combatants during an encounter is supported and uses the same insertion
path as initial setup. When the encounter is active, `<AddCombatants>`
additionally asks for an initiative value, then:

- **Inserts at position** by initiative; ties are broken by GM choice.
- **Determines "acts this round or next"** from whether that initiative slot
  has already passed in the current round. The result is presented as a
  confirmable default, never applied silently. A creature joining at initiative
  22 while the pointer is at 15 defaults to "acts next round", editable.
- **Optionally joins an existing group**, adopting that group's initiative
  instead of taking its own slot. This covers reinforcements arriving into an
  existing wave.

A returning player follows the same path plus a party change: toggling an
absent PC to present mid-fight adds their entry and recomputes the
present-party difficulty rating live.

Removal is symmetric, for creatures that die or flee. Removing the active entry
advances the pointer correctly and never renumbers the round.

## Conditions

A curated set of approximately 22 conditions is hand-implemented with correct
modifiers and decrement timing:

off-guard, frightened, sickened, clumsy, enfeebled, stupefied, drained, slowed,
stunned, quickened, prone, grabbed, restrained, immobilized, blinded, dazzled,
deafened, fatigued, doomed, dying, wounded, persistent damage.

Any other condition attaches as a **text-only tag** with a duration counter.

Rationale: a curated set is predictable and exhaustively testable. Interpreting
Foundry's `rules[]` arrays generically would give broader coverage at the cost
of owning a rule-element interpreter and its failure modes — unacceptable risk
for a tool used live at the table.

### Timing hooks

The turn engine fires:

- **Start of turn** — slowed and stunned reduce the action pool; the reaction
  refreshes.
- **End of turn** — frightened decreases by 1; persistent damage prompts the GM
  for a number; duration counters decrease by 1.

### Modifier resolution

One `computeModifiers()` function implements PF2 bonus and penalty stacking:
bonuses and penalties are typed (status, circumstance, item), only the highest
bonus and the worst penalty of each type apply, and untyped penalties stack.
This function is heavily tested.

### Positional states

Flanking, flanked and any other position-relative state are **manual toggles**
on a combatant, because position lives on the physical board. Toggling flanked
applies off-guard through the normal condition path.

## Applying damage, healing and conditions

Damage is an interaction with **whichever combatant was hit**, not with the one
whose turn it is — players act on their own turns and hit whoever they choose.
So damage, healing and condition entry live on the **combatant rows**, not in a
bar tied to the active creature.

Hovering a row opens a popover anchored to its right. It stays open while the
pointer is inside it, so the GM can pick a damage type and then type a number
without it closing. It carries: damage amount, Damage and Heal, add-condition,
a Flanked toggle, and a link to the full stat block.

### Damage type is shown only when it changes the result

The type selector appears **only when the target has damage-type immunities,
weaknesses or resistances**, and then lists **only the types that creature
actually cares about**, each labelled with its value. A creature with none gets
a one-line note instead. `None` (untyped) is the default and **resets after
every Damage push**, so a later hit cannot silently inherit an earlier type.
Heal never shows the selector.

The filter keys off *damage-type* entries specifically, not "has IWR": of the
838 creatures carrying some IWR, many entries are condition immunities —
disease, paralyzed, unconscious — that a damage type cannot affect.

## Turn prompts

Every timed effect fires as a prompt that states **the computation to perform**,
not merely the condition's name. A dying creature does not prompt "make a
recovery check"; it prompts `1d20 flat vs DC 12`, shows the derivation
`DC 10 + dying 2 = 12`, and lists what each of the four outcomes does.

Prompts are split by PF2's actual timing, which is not uniform:

- **Start of turn** — slowed and stunned reduce the action pool; fast healing
  and regeneration; dying recovery checks; reaction refresh.
- **End of turn** — persistent damage (roll, then the DC 15 flat check to end
  it) and frightened decrementing. These queue visibly during the turn and
  prompt when the GM presses Next.

Treating everything as start-of-turn would apply persistent damage a full turn
early, every turn.

### Prompts are dismissed by click, never by a timer

Each prompt persists until the GM explicitly acknowledges it. There is no
auto-dismiss, no fade, no timeout: the click *is* the record that the effect was
applied, and a prompt that vanished on its own would leave the GM unsure whether
they had dealt with it. A prompt whose effect the app applies itself (slowed
reducing the pool) still requires acknowledgement, so the GM knows the number
changed and why.

Unacknowledged prompts survive re-renders, target changes and navigation within
the encounter. Pressing Next with outstanding prompts is **allowed** — the same
indicator-not-blocker rule the action economy follows — but the button shows the
outstanding count, so skipping is a visible choice rather than an accident.

## Targeting and the roll assistant

A combatant may be selected as the **target**. With a target set, every action
and Strike on the active creature resolves to the die face the GM needs:

- A **modifier ledger** showing each contribution and its source — base attack
  bonus, status penalties, circumstance bonuses, MAP — so the number is
  auditable rather than magic.
- The **roll**: `1d20 + N` against the target's AC or save DC.
- An **outcome ladder**: critical hit, hit, miss, critical miss, each as a die
  range, with the damage dice to roll for that outcome.

Two rules that are easy to fumble at the table and must be folded in
automatically: only the **worst status penalty of a type applies**, so sickened
1 alongside frightened 2 is −1 and not −3; and a **natural 20 raises the degree
one step** (natural 1 lowers it), which changes where the critical band starts.

The assistant's purpose is that the GM reads one line, picks up the stated dice,
and rolls — with no arithmetic at the table.

## Action economy

The action pool is 3, adjusted by slowed, stunned and quickened.

**Strikes made this turn are tracked**, driving the multiple attack penalty.
Each Strike row shows its full MAP ladder with the applicable bonus highlighted
and spent ones struck through — a Longsword at +15 reads `+15 / +10 / +5` with
`+10` active after one Strike — so the GM reads the number rather than deriving
it. The counter is resettable for miscounts and clears when the turn ends.

The pool is an **indicator, never a blocker**:

- Actions costing more than the remaining pool render as `disabled`.
- Every affordable action stays live.
- Reaching zero actions makes the "next combatant" button prominent but never
  gates it.

Actions with a `frequency` (once per day, per hour, per combat) sort to the top
of the action list, so limited-use abilities are more likely to be used.

## Reactions

Each combatant has one reaction per round, refreshed at the start of their
turn. `<ReactionWatch>` highlights combatants with an unspent reaction and
displays the trigger text extracted by the data pipeline.

The reaction list **scrolls independently** of the rest of the turn manager: in
a large encounter it grows past the panel, and the round counter, action pips
and Next button must stay put.

## Persistence

Auto-save to IndexedDB on every state change, debounced. Two object stores:

- `parties` — rosters, levels, presence
- `encounters` — full in-progress combat state

Manual JSON export and import for backup and for moving between machines.

State is schema-versioned with migrations, so an encounter saved weeks earlier
still opens.

## Testing

Vitest.

- **`rules/` module** — exhaustive unit tests. Modifier stacking, turn
  transitions and their timing hooks, XP budget computation, party-level
  derivation including the one-character-ahead adjustment, action pool
  computation. This is where a bug would actually hurt mid-session.
- **Components** — React Testing Library, covering the interaction paths that
  matter: adding N creatures at once, group creation, mid-combat insertion,
  damage entry, advancing the turn.

## Deferred

- **Delay and Ready.** These move a combatant's slot in the initiative order and
  reuse the same insertion machinery, so they would be inexpensive to add. Not
  in scope for the first version.
- Bestiary 3 and other Adventure Path bestiaries — a data pipeline config
  change plus a book toggle.
