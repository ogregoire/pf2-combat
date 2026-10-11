import { conditionModifiers, type AppliedCondition, type Selector } from "./conditions.js";
import type { Modifier } from "./modifiers.js";

/** What a combatant carries that moves its numbers. */
export interface ModifierSources {
  conditions: AppliedCondition[];
}

/** Every modifier on a check answering to `selectors`: the combatant's
 * conditions. Unresolved — stacking is `resolveModifiers`' job. */
export function modifiersFor(source: ModifierSources, selectors: Selector | readonly Selector[]): Modifier[] {
  return conditionModifiers(source.conditions, selectors);
}
