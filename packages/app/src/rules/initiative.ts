/**
 * Turns what the GM typed into an initiative field into the value the app
 * actually stores, per combatant kind. A creature's field is a d20 result —
 * the GM is the one rolling a monster's initiative — so it's totalled with
 * the creature's own modifier (Perception), unless none is on record, in
 * which case the typed value commits unchanged rather than inventing a +0.
 * A PC's field is already the party's own reported final total — a player
 * reports their own number, not a die for the app to total, per the GM's
 * own rejection of that model ("The player can say 27, which is outside of
 * a D20") — so it always commits exactly as typed, modifier or not.
 *
 * The single place this rule lives: the row popover's own commitInitiative
 * (RowPopover.tsx) was the original, and Quick add and the + Add drawer
 * both call through here instead of re-deriving it, so the three places a
 * GM types an initiative can't drift apart.
 */
export function totalInitiative(kind: "pc" | "creature", typed: number, modifier: number | null): number {
  return kind === "creature" && modifier !== null ? typed + modifier : typed;
}
