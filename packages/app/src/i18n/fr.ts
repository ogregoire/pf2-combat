import { STRINGS_EN } from "./en.js";

/**
 * French chrome copy, following the remaster rulebooks' own vocabulary
 * (checked against the French module's `lang/fr.json`) rather than a literal
 * rendering of the English labels — e.g. Fortitude/Reflex/Will render as
 * Vigueur/Réflexes/Volonté, and the attack-roll degrees use the book's own
 * "Coup critique / Touché / Raté / Raté critique", not a generic
 * success/failure gloss. Where the tracker invented its own wording (the
 * outcome ladder's framing, the roll assistant's prompts, "strikes this
 * turn"), the French reads as table language a GM would actually say, not a
 * translation exercise.
 *
 * Typed against `keyof typeof STRINGS_EN` so a key added to `en.ts` without
 * a translation here is a compile error.
 */
export const STRINGS_FR: Record<keyof typeof STRINGS_EN, string> = {
  LABEL_AC: "CA",
  LABEL_HP: "PV",
  LABEL_HIT_POINTS: "POINTS DE VIE",
  LABEL_FORTITUDE: "Vigueur",
  LABEL_REFLEX: "Réflexes",
  LABEL_WILL: "Volonté",
  LABEL_INITIATIVE: "Initiative",
  LABEL_INITIATIVE_MODIFIER: "Mod. init.",
  INITIATIVE_MODIFIER_ARIA: "Modificateur d'initiative",
  LABEL_LEVEL: "Niveau",
  LABEL_NAME: "Nom",
  LABEL_PRESENT: "Présent",
  LABEL_TARGET: "Cibler",
  TARGET_NAME_ARIA: "Cibler {name}",
  LABEL_TARGETED: "Ciblé",
  LABEL_ADD: "Ajouter",
  LABEL_REMOVE: "Retirer",
  REMOVE_NAME_ARIA: "Retirer {name}",
  LABEL_CLOSE: "Fermer",
  CLOSE_NAME_ARIA: "Fermer {name}",
  LABEL_CANCEL: "Annuler",
  LABEL_CONFIRM: "Confirmer",
  LABEL_DAMAGE: "Dégâts",
  LABEL_HEAL: "Soins",
  ACTIONS_HEADING: "Actions",
  ACTIONS_UNIT: "actions",
  ROUND_LABEL: "ROUND",
  PC_PREFIX: "PJ",
  CREATURE_PREFIX: "Créature",
  DEFEATED_BADGE: "VAINCU",

  // ActionCard.tsx
  COST_FREE: "GRATUITE",
  COST_REACTION: "RÉACTION",
  COST_PASSIVE: "PASSIF",
  USE_ACTIONS_BUTTON: "Utiliser {cost} {unit}",
  USE_ACTION_UNIT_SINGULAR: "action",
  USE_ACTION_UNIT_PLURAL: "actions",
  USE_REACTION_BUTTON: "Utiliser la réaction",

  // ActionPips.tsx
  ACTIONS_REMAINING_HEADING: "ACTIONS RESTANTES",
  ACTIONS_REMAINING_OF_TOTAL: "{remaining} sur {total} — {reasons}",

  // AddCombatants.tsx
  ADD_COMBATANTS_TITLE: "Ajouter des combattants",
  ENCOUNTER_RUNNING_ROUND: "combat en cours — round {round}",
  SEARCH_CREATURES_ARIA: "Rechercher une créature",
  SEARCH_CREATURES_PLACEHOLDER: "Rechercher une créature…",
  MATCH_SINGULAR: "résultat",
  MATCH_PLURAL: "résultats",
  MATCH_HIDDEN_SUFFIX: " — {shown} affichés, affinez la recherche pour voir le reste",
  REMASTER_BADGE: "REMASTER",
  LEGACY_LABEL: "édition classique",
  QUANTITY_ARIA: "Quantité",
  FEWER_NAME_ARIA: "Moins de {name}",
  MORE_NAME_ARIA: "Plus de {name}",
  ADD_NAME_ARIA: "Ajouter {name}",
  CREATURE_LOADING: "chargement de la créature…",
  SLOT_PASSED_PREFIX: "Le créneau {slot} est déjà passé — agira",
  NEXT_ROUND_BOLD: "au prochain round",
  ACT_THIS_ROUND_BUTTON: "agir ce round-ci à la place",

  // CombatantList.tsx (GroupBuilder)
  GROUP_SELECTED_COUNT: "{n} sélectionné(s)",
  GROUP_NAME_LABEL: "Nom du groupe",
  GROUP_INITIATIVE_ARIA: "Initiative du groupe",
  GROUP_INITIATIVE_PLACEHOLDER: "Init",
  CREATE_GROUP_BUTTON: "Créer le groupe",
  DEFAULT_GROUP_NAME: "Groupe",

  // CombatantRow.tsx
  SHOW_ACTIONS_ARIA: "Afficher les actions de {name}",
  SELECT_FOR_GROUPING_ARIA: "Sélectionner {name} pour le groupement",

  // GroupHeader.tsx
  UNGROUP_BUTTON: "Dégrouper",
  DELAYED_LABEL: "retardé",

  // NextButton.tsx
  NEXT_COMBATANT_BUTTON: "Combattant suivant",
  UNACKNOWLEDGED_COUNT: "{n} non validé(s)",

  // PartyManager.tsx
  PARTY_TITLE: "Groupe",
  ADD_PLAYER_BUTTON: "Ajouter un joueur",
  CLEAR_PLAYERS_LABEL: "Effacer les joueurs",
  CLEAR_PLAYERS_CONFIRM: "Effacer {n} {word} ? Les retire aussi de l'ordre d'initiative s'ils y sont.",
  PLAYER_SINGULAR: "joueur",
  PLAYER_PLURAL: "joueurs",

  // PromptCard.tsx
  GOT_IT_BUTTON: "Compris",

  // QuickAdd.tsx
  QUICK_ADD_LABEL: "Ajout rapide",
  QUICK_ADD_ARIA: "Ajout rapide de créatures",
  QUICK_ADD_PLACEHOLDER: "6 gobelin guerrier 13",
  ADDED_MESSAGE: "{quantity} × {name} ajouté(s){suffix}{capped}",
  ADDED_AT_INITIATIVE: " à l'initiative {initiative}",
  ADDED_CAPPED: " (limité depuis {requested})",
  MATCHING_CREATURES_ARIA: "Joueurs et créatures correspondants",
  MORE_HIDDEN: "+{n} de plus — continuez à taper pour affiner",
  PLAYER_BADGE: "JOUEUR",
  ADDED_PLAYER_MESSAGE: "{name} ajouté(e)",

  // ReactionWatch.tsx
  REACTIONS_READY_HEADING: "RÉACTIONS PRÊTES",
  READY_COUNT: "{n} prête(s)",
  SPENT_BUTTON: "Utilisée",
  TRIGGER_LABEL: "Déclencheur",

  // RollAssistant.tsx
  DEGREE_CRITICAL_SUCCESS: "coup critique",
  DEGREE_SUCCESS: "touché",
  DEGREE_FAILURE: "raté",
  DEGREE_CRITICAL_FAILURE: "raté critique",
  SELECT_TARGET_MSG: "Sélectionnez une cible pour calculer les jets.",
  TARGET_LABEL_CAPS: "CIBLE",
  AC_UNKNOWN: "CA inconnue",
  RETARGET_HINT: "cliquez sur un combattant pour recibler",
  SELECT_STRIKE_MSG: "Sélectionnez une Frappe ci-dessus pour voir le jet.",
  TARGET_AC_UNKNOWN_MSG: "La CA de {name} est inconnue : aucun jet ne peut être calculé.",
  ORDINAL_1: "première",
  ORDINAL_2: "deuxième",
  ORDINAL_3: "troisième",
  ORDINAL_4: "quatrième",
  ORDINAL_5: "cinquième",
  STRIKE_THIS_TURN_SUFFIX: "{ordinal} Frappe de ce tour",
  SUPPRESSED_PENALTY_SUFFIX: "— pénalité pire déjà comptée",
  SUPPRESSED_TITLE_SUFFIX: " (supprimée)",
  TOTAL_ATTACK_MODIFIER: "modificateur d'attaque total",
  ROLL_LABEL: "JET",
  VS_AC_TEMPLATE: "contre CA {ac}",
  BASE_AC_TOOLTIP: "CA de base",
  NO_DAMAGE: "aucun dégât",
  RECORD_STRIKE_BUTTON: "Enregistrer la frappe",

  // RowPopover.tsx
  STEPPER_DECREASE_ARIA: "Diminuer {name}",
  STEPPER_INCREASE_ARIA: "Augmenter {name}",
  IWR_IMMUNE_SUFFIX: "immunisé",
  IWR_WEAKNESS: "faiblesse {value}",
  IWR_RESISTANCE: "résistance {value}",
  DAMAGE_TYPE_HEADING: "Type de dégâts — {n} pertinent(s)",
  DAMAGE_TYPE_GROUP_ARIA: "type de dégâts",
  DAMAGE_TYPE_NONE: "Aucun",

  // Sourced from data/, not invented — see damage-type-i18n-report.md for
  // each term's exact origin. bludgeoning/piercing/slashing/bleed/precision/
  // physical come from creature description prose ("dégâts contondants",
  // "... perforants", "... tranchants", "... de saignement", "... de
  // précision", "... physiques" — data/i18n/fr/creatures); acid/cold/
  // electricity/fire/force/sonic/vitality/void/mental/poison/spirit/holy/
  // unholy from data/i18n/fr/traits.json's own French trait names (the
  // element/energy traits share their word with the damage type). force/
  // mental/poison are spelled identically in both languages — see this
  // file's own ALLOWLIST entries in i18n/index.ts. all-damage/area-damage/
  // splash-damage have no single-word attestation (they're this app's own
  // pseudo-types for a blanket IWR entry, not a PF2 damage type with its own
  // glossary/trait page) — "tous les dégâts" / "dégâts de zone" / "dégâts
  // d'éclaboussure" are lifted from creature prose that names the same
  // blanket categories in context ("résistance ... contre tous les dégâts",
  // "tout dégât de zone", "dégâts d'éclaboussure de feu").
  DAMAGE_TYPE_NAME_BLUDGEONING: "contondant",
  DAMAGE_TYPE_NAME_PIERCING: "perforant",
  DAMAGE_TYPE_NAME_SLASHING: "tranchant",
  DAMAGE_TYPE_NAME_ACID: "acide",
  DAMAGE_TYPE_NAME_COLD: "froid",
  DAMAGE_TYPE_NAME_ELECTRICITY: "électricité",
  DAMAGE_TYPE_NAME_FIRE: "feu",
  DAMAGE_TYPE_NAME_FORCE: "force",
  DAMAGE_TYPE_NAME_SONIC: "son",
  DAMAGE_TYPE_NAME_VITALITY: "vitalité",
  DAMAGE_TYPE_NAME_VOID: "vide",
  DAMAGE_TYPE_NAME_MENTAL: "mental",
  DAMAGE_TYPE_NAME_POISON: "poison",
  DAMAGE_TYPE_NAME_BLEED: "saignement",
  DAMAGE_TYPE_NAME_PRECISION: "précision",
  DAMAGE_TYPE_NAME_SPIRIT: "spirituel",
  DAMAGE_TYPE_NAME_PHYSICAL: "physique",
  DAMAGE_TYPE_NAME_HOLY: "saint",
  DAMAGE_TYPE_NAME_UNHOLY: "impie",
  DAMAGE_TYPE_NAME_ALL_DAMAGE: "tous les dégâts",
  DAMAGE_TYPE_NAME_AREA_DAMAGE: "dégâts de zone",
  DAMAGE_TYPE_NAME_SPLASH_DAMAGE: "dégâts d'éclaboussure",
  // Not full PF2 prose ("X dégâts de [type] persistants") — that would need
  // a preposition and elision (de/d') this compact badge format has never
  // carried in either language (English drops "damage" the same way: "2d6
  // persistent fire", not "2d6 persistent fire damage"). Word order (this
  // word before or after the type it labels) is decided per-category in
  // rules/strike.ts's damageText, not here — "persistant" is a genuine
  // French adjective and reorders after its noun ("feu persistant"), while
  // "éclaboussure" is a noun and keeps English's category-before-type
  // order ("éclaboussure acide" already reads correctly). See the report
  // for the reasoning.
  DAMAGE_CATEGORY_PERSISTENT: "persistant",
  DAMAGE_CATEGORY_SPLASH: "éclaboussure",

  NO_HP_MSG: "Aucun PV enregistré — Dégâts et Soins désactivés.",
  AMOUNT_ARIA: "montant",
  ADD_CONDITION_HEADING: "Ajouter un état",
  PERSISTENT_DAMAGE_FORMULA_ARIA: "Formule des dégâts persistants",
  PERSISTENT_DAMAGE_PLACEHOLDER: "ex. 2d6",
  APPLIED_CONDITIONS_ARIA: "états appliqués",
  ADD_CONDITION_GROUP_ARIA: "ajouter un état",
  CURRENT_INITIATIVE_TITLE: "Initiative actuelle",
  CURRENT_INITIATIVE_ARIA: "Initiative actuelle {value}",
  UNROLLED_LABEL: "non lancée",
  INITIATIVE_VALUE_ARIA: "Valeur d'initiative",
  INITIATIVE_DIE_RESULT_ARIA: "Résultat du dé d'initiative",
  SET_INITIATIVE_BUTTON: "Définir l'initiative",

  // TurnManager.tsx
  CLEAR_ENEMIES_LABEL: "Effacer les ennemis",
  CLEAR_ENEMIES_CONFIRM: "Effacer {n} {word} ?",
  ENEMY_SINGULAR: "ennemi",
  ENEMY_PLURAL: "ennemis",
  RESET_ENCOUNTER_LABEL: "Réinitialiser le combat",
  RESET_ENCOUNTER_CONFIRM: "Réinitialiser le combat ? Efface les {n} {word} et revient au round 1. Les joueurs sont conservés.",
  COMBATANT_WORD_SINGULAR: "combattant",
  COMBATANT_WORD_PLURAL: "combattants",
  STRIKES_THIS_TURN_LABEL: "FRAPPES CE TOUR-CI",
  RESET_STRIKES_ARIA: "Réinitialiser les frappes de ce tour",
  RESET_BUTTON: "réinitialiser",
  DELAY_BUTTON: "Retarder",
  DELAY_DISABLED_TITLE: "Retarder fait avancer le tour, ce qui nécessite d'abord l'initiative de tout le monde",
  RETURN_FROM_DELAY_TITLE: "Revient dans l'ordre juste après {entry}, en prenant définitivement cette initiative",
  CURRENT_TURN_FALLBACK: "le tour en cours",
  RETURN_BUTTON: "Revenir : {entry}",
  DEFAULT_COMBATANT_LABEL: "Combattant",

  // TurnPrompts.tsx
  RESOLVE_NOW_LABEL: "À RÉSOUDRE MAINTENANT",
  TO_RESOLVE_BADGE: "{n} À RÉSOUDRE",
  WAITING_END_OF_TURN: "EN ATTENTE DE FIN DE TOUR — {n} {word}",
  ITEM_WORD_SINGULAR: "ÉLÉMENT",
  ITEM_WORD_PLURAL: "ÉLÉMENTS",

  // EncounterScreen.tsx
  XP_TOTAL_LABEL: "XP en jeu",
  XP_TOTAL_TOOLTIP: "Chaque créature de la rencontre, vaincue ou non — ce que vaut le combat dans son ensemble. À comparer avec votre budget de rencontre.",
  XP_EARNED_LABEL: "XP gagné chacun",
  XP_EARNED_TOOLTIP: "Créatures effectivement vaincues. C'est ce que gagne chaque personnage à la fin du combat — la taille du groupe ne le divise pas.",
  PRESENT_COUNT: "{present} sur {total} présent(s)",
  PARTY_LEVEL_LABEL: "niveau du groupe {level}",
  LOADING_BOOKS_MSG: "chargement des ouvrages…",
  CATALOG_ERROR_PREFIX: "Impossible de charger le catalogue de créatures : {message}",
  ADD_SHORT_BUTTON: "+ Ajouter",
  TABS_LIST: "Liste",
  TABS_ACTIVE: "Actif",
  TABS_TURN: "Tour",
  TABS_ARIA_LABEL: "Panneaux du combat",

  // rules/prompts.ts (start/end-of-turn notifications, TurnPrompts.tsx) —
  // "DD" (Degré de Difficulté) and "test/jet à l'aveugle" follow the
  // remaster's own vocabulary (checked against data/i18n/fr/traits.json and
  // conditions.json's "dying" description, which itself says "test de
  // récupération").
  PROMPT_RECOVERY_TITLE: "Test de récupération",
  PROMPT_RECOVERY_COMPUTATION: "Jet à l'aveugle 1d20 contre DD {dc}",
  PROMPT_RECOVERY_DERIVATION: "DD 10 + {name} {value} = {dc}",
  PROMPT_NAME_VALUE: "{name} {value}",
  PROMPT_ACTION_LOSS_TITLE: "Perd {value} action{plural} ce tour-ci",
  PROMPT_ACTION_POOL_AUTO_APPLIED: "Réserve d'actions {before} → {after}",
  PROMPT_CONDITION_DECREASES_TITLE: "{name} diminue",
  PROMPT_NAME_DECREASE: "{name} {from} → {to}",
  PROMPT_PERSISTENT_DAMAGE_TITLE: "Dégâts persistants",
  PROMPT_PERSISTENT_DAMAGE_COMPUTATION: "Lancez {formula}, puis DD 15 à l'aveugle pour y mettre fin",
  PROMPT_PERSISTENT_DAMAGE_FORMULA_FALLBACK: "les dégâts persistants",
  PROMPT_PERSISTENT_DAMAGE_ENDS: "l'état se termine",
  PROMPT_PERSISTENT_DAMAGE_CONTINUES: "il persiste",
};
