/**
 * Whether an ability's own text lets its user Sustain it — "can Sustain
 * Soul Scream", "can Sustain a Spell to continue Amalgam", "as long as the
 * hound Sustains the effect" — as opposed to one that only counts as
 * Sustaining something else (Manipulate Flames) or grants the action
 * (Effortless Concentration). Read from the English text, which every
 * creature record carries.
 */
export function isSustainable(description: string): boolean {
  return /\b(?:can|may) Sustain\b|\bSustains the effect\b/.test(description);
}
