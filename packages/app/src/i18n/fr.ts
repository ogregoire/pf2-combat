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
  LABEL_CONDITION: "État",
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
  COMBATANTS_COUNT: "{n} combattants",

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
  INITIATIVE_FOR_NAME_ARIA: "Initiative de {name}",
  ADD_TO_ENCOUNTER_BUTTON: "Ajouter au combat",

  // PromptCard.tsx
  GOT_IT_BUTTON: "Compris",

  // QuickAdd.tsx
  QUICK_ADD_LABEL: "Ajout rapide",
  QUICK_ADD_ARIA: "Ajout rapide de créatures",
  QUICK_ADD_PLACEHOLDER: "6 gobelin guerrier 13",
  ADDED_MESSAGE: "{quantity} × {name} ajouté(s){suffix}{capped}",
  ADDED_AT_INITIATIVE: " à l'initiative {initiative}",
  ADDED_CAPPED: " (limité depuis {requested})",
  MATCHING_CREATURES_ARIA: "Créatures correspondantes",
  MORE_HIDDEN: "+{n} de plus — continuez à taper pour affiner",

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
  TOTAL_ATTACK_MODIFIER: "modificateur d'attaque total",
  ROLL_LABEL: "JET",
  VS_AC_TEMPLATE: "contre CA {ac}",
  NO_DAMAGE: "aucun dégât",
  RECORD_STRIKE_BUTTON: "Enregistrer la frappe",

  // RowPopover.tsx
  IWR_IMMUNE_SUFFIX: "immunisé",
  IWR_WEAKNESS: "faiblesse {value}",
  IWR_RESISTANCE: "résistance {value}",
  NO_IWR_MSG: "Aucune immunité, faiblesse ou résistance — le type de dégâts n'a pas d'importance ici.",
  DAMAGE_TYPE_HEADING: "Type de dégâts — {n} pertinent(s)",
  DAMAGE_TYPE_GROUP_ARIA: "type de dégâts",
  DAMAGE_TYPE_NONE: "Aucun",
  NO_HP_MSG: "Aucun PV enregistré — Dégâts et Soins désactivés.",
  AMOUNT_ARIA: "montant",
  ADD_CONDITION_HEADING: "Ajouter un état",
  CONDITION_VALUE_ARIA: "Valeur de l'état",
  PERSISTENT_DAMAGE_FORMULA_ARIA: "Formule des dégâts persistants",
  PERSISTENT_DAMAGE_PLACEHOLDER: "ex. 2d6",

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

  // TurnPrompts.tsx
  RESOLVE_NOW_LABEL: "À RÉSOUDRE MAINTENANT",
  TO_RESOLVE_BADGE: "{n} À RÉSOUDRE",
  WAITING_END_OF_TURN: "EN ATTENTE DE FIN DE TOUR — {n} {word}",
  ITEM_WORD_SINGULAR: "ÉLÉMENT",
  ITEM_WORD_PLURAL: "ÉLÉMENTS",

  // EncounterScreen.tsx
  XP_TOOLTIP: "Chaque personnage gagne tout l'XP du combat — la taille du groupe ne change pas le gain",
  XP_EACH_LABEL: "XP chacun",
  PRESENT_COUNT: "{present} sur {total} présent(s)",
  PARTY_LEVEL_LABEL: "niveau du groupe {level}",
  LOADING_BOOKS_MSG: "chargement des ouvrages…",
  CATALOG_ERROR_PREFIX: "Impossible de charger le catalogue de créatures : {message}",
  ADD_SHORT_BUTTON: "+ Ajouter",
  TABS_LIST: "Liste",
  TABS_ACTIVE: "Actif",
  TABS_TURN: "Tour",
  TABS_ARIA_LABEL: "Panneaux du combat",

  // StatBlockHeader.tsx
  CREATURE_FALLBACK_BADGE: "EN",
  CREATURE_FALLBACK_TITLE: "Pas de traduction française pour cette créature — le nom anglais est affiché.",
};
