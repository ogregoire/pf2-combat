import { describe, expect, it } from "vitest";
import { pluralize } from "../src/rules/plural.js";

describe("pluralize", () => {
  // English unchanged — existing behaviour must not move.
  it("appends s in English", () => expect(pluralize("Goblin", 2, "en")).toBe("Goblins"));
  it("returns the singular for a quantity of 1", () => expect(pluralize("Gobelin", 1, "fr")).toBe("Gobelin"));

  // French rules, applied to the LAST word of the name — or, when the name
  // is an "X <preposition> Y" compound, to the last word of X, the head
  // noun (see the prepositional-compound tests below). Neither case is
  // reliably the first word ("Troll des glaces" pluralises "Troll", the
  // word BEFORE "des"; "Chauves-souris crépitante" pluralises the
  // trailing adjective, since there's no preposition here to redirect to).
  it("appends s to a plain French noun", () => expect(pluralize("Gobelin", 2, "fr")).toBe("Gobelins"));
  it("leaves a name already ending in s, x or z unchanged", () => {
    expect(pluralize("Chauves-souris crépitante", 2, "fr")).toBe("Chauves-souris crépitantes");
    expect(pluralize("Kobold véreux", 2, "fr")).toBe("Kobold véreux");
    // "Rémorhaz" — a real creature name — pins the -z branch specifically:
    // the -s/-x test above doesn't exercise it, so a mutant that dropped
    // just the -z check passed undetected until this was added.
    expect(pluralize("Rémorhaz", 2, "fr")).toBe("Rémorhaz");
  });
  it("turns -al into -aux", () => expect(pluralize("Cheval", 2, "fr")).toBe("Chevaux"));
  it("adds x after -eau and -eu", () => {
    expect(pluralize("Corbeau", 2, "fr")).toBe("Corbeaux");
    // "Dracolisque bleu" — a real creature name. It previously asserted
    // "bleux", which is not French: "bleu" is one of the short list of -eu
    // words taking -s (bleu, pneu, émeu). Corrected rather than preserved.
    // Note the noun stays singular: full adjective agreement ("Dracolisques
    // bleus") needs number to propagate across the whole name, which this
    // rule set deliberately does not attempt — see the module doc.
    expect(pluralize("Dracolisque bleu", 2, "fr")).toBe("Dracolisque bleus");
    // "Feu" exercises the -eu → -x branch that "bleu" no longer does.
    expect(pluralize("Élémentaire feu", 2, "fr")).toBe("Élémentaire feux");
  });
  it("leaves a parenthesised qualifier alone", () => {
    expect(pluralize("Jann (Génie)", 2, "fr")).toBe("Janns (Génie)");
  });

  // "X <preposition> Y" compounds: the head noun is X, the word BEFORE the
  // preposition, not the last word of the name. All examples are real
  // creature/NPC names from data/i18n/fr/index — found by running the
  // rule over all 1450 real names and checking the output against French
  // grammar (see task-3-report.md for the full count).
  describe("prepositional compounds", () => {
    it("pluralises the word before 'du'", () => expect(pluralize("Garde du corps", 2, "fr")).toBe("Gardes du corps"));
    it("pluralises the word before 'à'", () =>
      expect(pluralize("Policier à cheval", 2, "fr")).toBe("Policiers à cheval"));
    it("pluralises the word before 'de la'", () =>
      expect(pluralize("Capitaine de la garde", 2, "fr")).toBe("Capitaines de la garde"));
    it("pluralises the word before 'de'", () =>
      expect(pluralize("Chasseur de primes", 2, "fr")).toBe("Chasseurs de primes"));
    // The worst case of the old last-word rule: a deity's name getting an
    // "s" grafted on ("Zon-Kuthons"). Never touched now.
    it("never pluralises the proper name after the preposition", () =>
      expect(pluralize("Blasphémateur de Zon-Kuthon", 2, "fr")).toBe("Blasphémateurs de Zon-Kuthon"));
    // A hyphenated first word ("Homme-félin") is one token, same as the
    // plain-noun case — the preposition split point is unaffected by it.
    it("pluralises the word before the preposition even after a hyphenated word", () =>
      expect(pluralize("Homme-félin collectionneur de noms", 2, "fr")).toBe(
        "Homme-félin collectionneurs de noms",
      ));
    // Two "de"s: must split at the FIRST one, not the second — otherwise
    // this would wrongly pluralise "méduses" instead of "Nuée".
    it("splits at the first preposition when the name has more than one", () =>
      expect(pluralize("Nuée de méduses de feu", 2, "fr")).toBe("Nuées de méduses de feu"));
  });

  it("pluralises an accented -éau stem, which an endsWith(\"eau\") test misses", () => {
    // "fléau" ends in é-a-u, so the original -eau rule produced "fléaus".
    expect(pluralize("Fléau des arbres", 2, "fr")).toBe("Fléaux des arbres");
    expect(pluralize("Solifuge fléau des dunes", 2, "fr")).toBe("Solifuge fléaux des dunes");
  });

  it("keeps the -eu words that take -s rather than -x", () => {
    // French's exception list is short; "bleu" is the one that occurs here.
    // The head noun is left singular on purpose — adjective agreement is
    // out of scope, so this asserts the rule's real output, not ideal French.
    expect(pluralize("Diable bleu", 2, "fr")).toBe("Diable bleus");
  });
});
