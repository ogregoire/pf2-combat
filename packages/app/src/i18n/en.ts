/**
 * The app's own chrome copy — buttons, headings, labels, tooltips and
 * prompts that belong to the tracker itself, not to any creature/condition/
 * trait record. This is the source of truth for the key union: `fr.ts` is
 * typed against `keyof typeof STRINGS_EN`, so a missing French translation
 * is a compile error, not just a failed test.
 *
 * Values here are English exactly as the existing components/tests already
 * render it — Task 11 draws every literal from this catalogue without
 * changing any English wording, so this file's values must stay
 * byte-for-byte what was previously hardcoded.
 */
export const STRINGS_EN = {
  // Shared vocabulary (saves, defences, common actions) reused across
  // several components rather than duplicated per file.
  LABEL_AC: "AC",
  LABEL_HP: "HP",
  LABEL_HIT_POINTS: "HIT POINTS",
  LABEL_FORTITUDE: "Fortitude",
  LABEL_REFLEX: "Reflex",
  LABEL_WILL: "Will",
  LABEL_INITIATIVE: "Initiative",
  LABEL_INITIATIVE_MODIFIER: "Init mod",
  INITIATIVE_MODIFIER_ARIA: "Initiative modifier",
  LABEL_LEVEL: "Level",
  LABEL_NAME: "Name",
  LABEL_PRESENT: "Present",
  LABEL_TARGET: "Target",
  TARGET_NAME_ARIA: "Target {name}",
  LABEL_TARGETED: "Targeted",
  LABEL_ADD: "Add",
  LABEL_REMOVE: "Remove",
  REMOVE_NAME_ARIA: "Remove {name}",
  LABEL_CLOSE: "Close",
  CLOSE_NAME_ARIA: "Close {name}",
  LABEL_CANCEL: "Cancel",
  LABEL_CONFIRM: "Confirm",
  LABEL_DAMAGE: "Damage",
  LABEL_HEAL: "Heal",
  ACTIONS_HEADING: "Actions",
  ACTIONS_UNIT: "actions",
  ROUND_LABEL: "ROUND",
  PC_PREFIX: "PC",
  CREATURE_PREFIX: "Creature",
  DEFEATED_BADGE: "DEFEATED",

  // ActionCard.tsx
  COST_FREE: "FREE",
  COST_REACTION: "REACTION",
  COST_PASSIVE: "PASSIVE",
  USE_ACTIONS_BUTTON: "Use {cost} {unit}",
  USE_ACTION_UNIT_SINGULAR: "action",
  USE_ACTION_UNIT_PLURAL: "actions",
  USE_REACTION_BUTTON: "Use reaction",

  // ActionPips.tsx
  ACTIONS_REMAINING_HEADING: "ACTIONS REMAINING",
  ACTIONS_REMAINING_OF_TOTAL: "{remaining} of {total} — {reasons}",

  // AddCombatants.tsx
  ADD_COMBATANTS_TITLE: "Add combatants",
  ENCOUNTER_RUNNING_ROUND: "encounter is running — round {round}",
  SEARCH_CREATURES_ARIA: "Search creatures",
  SEARCH_CREATURES_PLACEHOLDER: "Search creatures…",
  MATCH_SINGULAR: "match",
  MATCH_PLURAL: "matches",
  MATCH_HIDDEN_SUFFIX: " — showing {shown}, refine your search to see the rest",
  REMASTER_BADGE: "REMASTER",
  LEGACY_LABEL: "legacy",
  QUANTITY_ARIA: "Quantity",
  FEWER_NAME_ARIA: "Fewer {name}",
  MORE_NAME_ARIA: "More {name}",
  ADD_NAME_ARIA: "Add {name}",
  CREATURE_LOADING: "loading creature record…",
  SLOT_PASSED_PREFIX: "Slot {slot} has passed — acts",
  NEXT_ROUND_BOLD: "next round",
  ACT_THIS_ROUND_BUTTON: "act this round instead",

  // CombatantList.tsx (GroupBuilder)
  GROUP_SELECTED_COUNT: "{n} selected",
  GROUP_NAME_LABEL: "Group name",
  GROUP_INITIATIVE_ARIA: "Group initiative",
  GROUP_INITIATIVE_PLACEHOLDER: "Init",
  CREATE_GROUP_BUTTON: "Create group",
  DEFAULT_GROUP_NAME: "Group",

  // CombatantRow.tsx
  SHOW_ACTIONS_ARIA: "Show actions for {name}",
  SELECT_FOR_GROUPING_ARIA: "Select {name} for grouping",

  // GroupHeader.tsx
  UNGROUP_BUTTON: "Ungroup",
  DELAYED_LABEL: "delayed",

  // NextButton.tsx
  NEXT_COMBATANT_BUTTON: "Next combatant",
  UNACKNOWLEDGED_COUNT: "{n} unacknowledged",

  // PartyManager.tsx
  PARTY_TITLE: "Party",
  ADD_PLAYER_BUTTON: "Add player",
  CLEAR_PLAYERS_LABEL: "Clear players",
  CLEAR_PLAYERS_CONFIRM: "Clear {n} {word}? Also removes any of them already in the initiative order.",
  PLAYER_SINGULAR: "player",
  PLAYER_PLURAL: "players",

  // PromptCard.tsx
  GOT_IT_BUTTON: "Got it",

  // QuickAdd.tsx
  QUICK_ADD_LABEL: "Quick add",
  QUICK_ADD_ARIA: "Quick add creatures",
  QUICK_ADD_PLACEHOLDER: "6 goblin warrior 13",
  ADDED_MESSAGE: "added {quantity} × {name}{suffix}{capped}",
  ADDED_AT_INITIATIVE: " at {initiative}",
  ADDED_CAPPED: " (capped from {requested})",
  MATCHING_CREATURES_ARIA: "Matching players and creatures",
  MORE_HIDDEN: "+{n} more — keep typing to narrow it down",
  PLAYER_BADGE: "PLAYER",
  ADDED_PLAYER_MESSAGE: "added {name}",

  // ReactionWatch.tsx
  REACTIONS_READY_HEADING: "REACTIONS READY",
  READY_COUNT: "{n} ready",
  SPENT_BUTTON: "Spent",
  TRIGGER_LABEL: "Trigger",

  // RollAssistant.tsx
  DEGREE_CRITICAL_SUCCESS: "critical hit",
  DEGREE_SUCCESS: "hit",
  DEGREE_FAILURE: "miss",
  DEGREE_CRITICAL_FAILURE: "critical miss",
  SELECT_TARGET_MSG: "Select a target to compute rolls against.",
  TARGET_LABEL_CAPS: "TARGET",
  AC_UNKNOWN: "AC unknown",
  RETARGET_HINT: "click any combatant to retarget",
  SELECT_STRIKE_MSG: "Select a Strike above to see the roll.",
  TARGET_AC_UNKNOWN_MSG: "{name}’s AC is unknown, so no roll can be computed against them.",
  ORDINAL_1: "first",
  ORDINAL_2: "second",
  ORDINAL_3: "third",
  ORDINAL_4: "fourth",
  ORDINAL_5: "fifth",
  STRIKE_THIS_TURN_SUFFIX: "{ordinal} Strike this turn",
  SUPPRESSED_PENALTY_SUFFIX: "— worse penalty already counted",
  SUPPRESSED_TITLE_SUFFIX: " (suppressed)",
  TOTAL_ATTACK_MODIFIER: "total attack modifier",
  ROLL_LABEL: "ROLL",
  VS_AC_TEMPLATE: "vs AC {ac}",
  BASE_AC_TOOLTIP: "base AC",
  NO_DAMAGE: "no damage",
  RECORD_STRIKE_BUTTON: "Record strike",

  // RowPopover.tsx
  IWR_IMMUNE_SUFFIX: "immune",
  IWR_WEAKNESS: "weakness {value}",
  IWR_RESISTANCE: "resistance {value}",
  DAMAGE_TYPE_HEADING: "Damage type — {n} relevant",
  DAMAGE_TYPE_GROUP_ARIA: "damage type",
  DAMAGE_TYPE_NONE: "None",
  NO_HP_MSG: "No HP on record — Damage and Heal are disabled.",
  AMOUNT_ARIA: "amount",
  ADD_CONDITION_HEADING: "Add condition",
  PERSISTENT_DAMAGE_FORMULA_ARIA: "Persistent damage formula",
  PERSISTENT_DAMAGE_PLACEHOLDER: "e.g. 2d6",
  APPLIED_CONDITIONS_ARIA: "applied conditions",
  ADD_CONDITION_GROUP_ARIA: "add condition",
  CURRENT_INITIATIVE_TITLE: "Current initiative",
  CURRENT_INITIATIVE_ARIA: "Current initiative {value}",
  UNROLLED_LABEL: "unrolled",
  INITIATIVE_VALUE_ARIA: "Initiative value",
  SET_INITIATIVE_BUTTON: "Set initiative",

  // TurnManager.tsx
  CLEAR_ENEMIES_LABEL: "Clear enemies",
  CLEAR_ENEMIES_CONFIRM: "Clear {n} {word}?",
  ENEMY_SINGULAR: "enemy",
  ENEMY_PLURAL: "enemies",
  RESET_ENCOUNTER_LABEL: "Reset encounter",
  RESET_ENCOUNTER_CONFIRM: "Reset the encounter? Clears all {n} {word} and returns to round 1. Players are kept.",
  COMBATANT_WORD_SINGULAR: "combatant",
  COMBATANT_WORD_PLURAL: "combatants",
  STRIKES_THIS_TURN_LABEL: "STRIKES THIS TURN",
  RESET_STRIKES_ARIA: "Reset strikes this turn",
  RESET_BUTTON: "reset",
  DELAY_BUTTON: "Delay",
  DELAY_DISABLED_TITLE: "Delaying advances the turn, which needs everyone's initiative first",
  RETURN_FROM_DELAY_TITLE: "Returns to the order just after {entry}, permanently taking that initiative",
  CURRENT_TURN_FALLBACK: "the current turn",
  RETURN_BUTTON: "Return {entry}",
  DEFAULT_COMBATANT_LABEL: "Combatant",

  // TurnPrompts.tsx
  RESOLVE_NOW_LABEL: "RESOLVE NOW",
  TO_RESOLVE_BADGE: "{n} TO RESOLVE",
  WAITING_END_OF_TURN: "WAITING FOR END OF TURN — {n} {word}",
  ITEM_WORD_SINGULAR: "ITEM",
  ITEM_WORD_PLURAL: "ITEMS",

  // EncounterScreen.tsx
  XP_TOTAL_LABEL: "XP on the table",
  XP_TOTAL_TOOLTIP: "Every creature in this encounter, defeated or not — what the whole fight is worth. Weigh this against your encounter budget.",
  XP_EARNED_LABEL: "XP earned each",
  XP_EARNED_TOOLTIP: "Creatures actually defeated. This is what each character gains when the fight ends — party size does not divide it.",
  PRESENT_COUNT: "{present} of {total} present",
  PARTY_LEVEL_LABEL: "party level {level}",
  LOADING_BOOKS_MSG: "loading books…",
  CATALOG_ERROR_PREFIX: "Could not load the creature catalog: {message}",
  ADD_SHORT_BUTTON: "+ Add",
  TABS_LIST: "List",
  TABS_ACTIVE: "Active",
  TABS_TURN: "Turn",
  TABS_ARIA_LABEL: "Encounter panes",

  // rules/prompts.ts (start/end-of-turn notifications, TurnPrompts.tsx)
  PROMPT_RECOVERY_TITLE: "Recovery check",
  PROMPT_RECOVERY_COMPUTATION: "1d20 flat check vs DC {dc}",
  PROMPT_RECOVERY_DERIVATION: "DC 10 + {name} {value} = {dc}",
  PROMPT_NAME_VALUE: "{name} {value}",
  PROMPT_ACTION_LOSS_TITLE: "Lose {value} action{plural} this turn",
  PROMPT_ACTION_POOL_AUTO_APPLIED: "Action pool {before} → {after}",
  PROMPT_CONDITION_DECREASES_TITLE: "{name} decreases",
  PROMPT_NAME_DECREASE: "{name} {from} → {to}",
  PROMPT_PERSISTENT_DAMAGE_TITLE: "Persistent damage",
  PROMPT_PERSISTENT_DAMAGE_COMPUTATION: "Roll {formula}, then DC 15 flat check to end it",
  PROMPT_PERSISTENT_DAMAGE_FORMULA_FALLBACK: "the persistent damage",
  PROMPT_PERSISTENT_DAMAGE_ENDS: "the condition ends",
  PROMPT_PERSISTENT_DAMAGE_CONTINUES: "it persists",
} as const;

export type StringKey = keyof typeof STRINGS_EN;
