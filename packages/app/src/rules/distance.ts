/** A distance stored in feet, as the display language prints it: "30 feet"
 * in English, "9 m" in French (the French rulebooks' 1,5 m per 5 feet). */
export function formatDistance(feet: number, lang: "en" | "fr"): string {
  if (lang === "en") return `${feet} feet`;
  return `${String(Math.round(feet * 0.3 * 10) / 10).replace(".", ",")} m`;
}
