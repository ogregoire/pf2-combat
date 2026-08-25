/**
 * Colour and icon for each PF2 damage type — the "DAMAGE TYPE — 7 RELEVANT"
 * row in mockups/DamagePopover.dc.html, extracted so the popover's selector
 * and a strike's damage line read the same table.
 *
 * Presentation only: rules/damage.ts owns which types exist and what they do
 * to a number, and stays free of anything visual.
 */

export interface DamageTypeStyle {
  /** Resting border — the button's outline when it isn't the chosen type. */
  border: string;
  /** Label and icon colour. Carries the type's identity at rest. */
  color: string;
  /** Fill once chosen. The mockup brightens the whole chip rather than
   * merely re-tinting its border, so the pick stays obvious at a glance. */
  activeBg: string;
  /** Border once chosen — a lighter step of the same hue. */
  activeBorder: string;
}

/**
 * Physical damage carries no elemental identity, so it keeps the mockup's
 * neutral treatment (its piercing/slashing chips) rather than being given an
 * invented hue. The abstract buckets — precision, and the all/area/splash
 * pseudo-types the dataset uses for blanket resistances — sit here too.
 */
const NEUTRAL: DamageTypeStyle = {
  border: "oklch(0.36 0.015 60)",
  color: "oklch(0.76 0.012 75)",
  activeBg: "oklch(0.34 0.03 60)",
  activeBorder: "oklch(0.56 0.05 60)",
};

/**
 * Hues run the wheel so that no two types a creature is likely to carry
 * together land on the same colour: fire 45 → electricity 95 → acid 120 →
 * poison 140 → vitality 170 → sonic 195 → cold 230 → spirit 265 → void 285 →
 * mental 300 → force 320 → unholy 355 → bleed 25.
 *
 * The seven the mockup specifies (none, mental, poison, cold, electricity,
 * fire, piercing, slashing) keep its published values exactly; the rest are
 * built to the same recipe — border ~oklch(0.40 0.07 H), label ~oklch(0.78
 * 0.09 H) — so the row reads as one set.
 */
export const DAMAGE_TYPE_STYLE: Record<string, DamageTypeStyle> = {
  // The selector's opt-out, not a damage type: neutral by design, since
  // "None" means the GM is deliberately not applying IWR.
  none: {
    border: "oklch(0.36 0.015 60)",
    color: "oklch(0.95 0.01 80)",
    activeBg: "oklch(0.38 0.03 60)",
    activeBorder: "oklch(0.56 0.05 60)",
  },

  bludgeoning: NEUTRAL,
  piercing: NEUTRAL,
  slashing: NEUTRAL,
  physical: NEUTRAL,
  precision: NEUTRAL,
  "all-damage": NEUTRAL,
  "area-damage": NEUTRAL,
  "splash-damage": NEUTRAL,

  bleed: {
    border: "oklch(0.40 0.09 25)",
    color: "oklch(0.74 0.12 25)",
    activeBg: "oklch(0.30 0.08 25)",
    activeBorder: "oklch(0.54 0.11 25)",
  },
  fire: {
    border: "oklch(0.42 0.08 45)",
    color: "oklch(0.78 0.10 45)",
    activeBg: "oklch(0.30 0.07 45)",
    activeBorder: "oklch(0.56 0.10 45)",
  },
  holy: {
    border: "oklch(0.44 0.06 85)",
    color: "oklch(0.86 0.08 85)",
    activeBg: "oklch(0.32 0.05 85)",
    activeBorder: "oklch(0.58 0.08 85)",
  },
  electricity: {
    border: "oklch(0.42 0.07 95)",
    color: "oklch(0.80 0.10 95)",
    activeBg: "oklch(0.30 0.06 95)",
    activeBorder: "oklch(0.56 0.09 95)",
  },
  acid: {
    border: "oklch(0.40 0.08 120)",
    color: "oklch(0.79 0.11 120)",
    activeBg: "oklch(0.29 0.07 120)",
    activeBorder: "oklch(0.54 0.10 120)",
  },
  poison: {
    border: "oklch(0.40 0.07 140)",
    color: "oklch(0.78 0.09 140)",
    activeBg: "oklch(0.29 0.06 140)",
    activeBorder: "oklch(0.54 0.09 140)",
  },
  vitality: {
    border: "oklch(0.40 0.06 170)",
    color: "oklch(0.80 0.08 170)",
    activeBg: "oklch(0.29 0.05 170)",
    activeBorder: "oklch(0.54 0.08 170)",
  },
  sonic: {
    border: "oklch(0.40 0.06 195)",
    color: "oklch(0.79 0.08 195)",
    activeBg: "oklch(0.29 0.05 195)",
    activeBorder: "oklch(0.54 0.08 195)",
  },
  cold: {
    border: "oklch(0.36 0.05 230)",
    color: "oklch(0.76 0.07 230)",
    activeBg: "oklch(0.28 0.05 230)",
    activeBorder: "oklch(0.52 0.07 230)",
  },
  spirit: {
    border: "oklch(0.40 0.06 265)",
    color: "oklch(0.78 0.08 265)",
    activeBg: "oklch(0.29 0.06 265)",
    activeBorder: "oklch(0.54 0.08 265)",
  },
  void: {
    border: "oklch(0.36 0.05 285)",
    color: "oklch(0.70 0.06 285)",
    activeBg: "oklch(0.26 0.05 285)",
    activeBorder: "oklch(0.50 0.07 285)",
  },
  mental: {
    border: "oklch(0.40 0.06 300)",
    color: "oklch(0.80 0.07 300)",
    activeBg: "oklch(0.30 0.06 300)",
    activeBorder: "oklch(0.54 0.08 300)",
  },
  force: {
    border: "oklch(0.42 0.08 320)",
    color: "oklch(0.80 0.10 320)",
    activeBg: "oklch(0.31 0.07 320)",
    activeBorder: "oklch(0.56 0.09 320)",
  },
  unholy: {
    border: "oklch(0.40 0.09 355)",
    color: "oklch(0.76 0.11 355)",
    activeBg: "oklch(0.30 0.08 355)",
    activeBorder: "oklch(0.54 0.10 355)",
  },
};

/**
 * A damage type that isn't in the table — the dataset carries types as free
 * strings, so a new upstream one must render plainly rather than crash or
 * disappear. The guardrail test in damage-types.test.tsx is what keeps every
 * *known* type off this path.
 */
export function damageTypeStyle(type: string): DamageTypeStyle {
  return DAMAGE_TYPE_STYLE[type] ?? NEUTRAL;
}

/** Paths only — the wrapping <svg> and its stroke attributes are shared. */
const ICON_PATHS: Record<string, React.ReactElement> = {
  none: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m5.6 5.6 12.8 12.8" />
    </>
  ),
  bludgeoning: (
    <>
      <circle cx="16" cy="8" r="4.5" />
      <path d="M12.8 11.2 4 20" />
    </>
  ),
  piercing: (
    <>
      <path d="M20 3 9 14" />
      <path d="m6 17 3-3-3-3-3 3z" />
      <path d="m14 9 3 3" />
    </>
  ),
  slashing: (
    <>
      <path d="M4 20 18 6a3 3 0 0 0-4-4L4 14z" />
      <path d="m14 10 4 4" />
    </>
  ),
  physical: <path d="M12 3 21 12 12 21 3 12z" />,
  precision: (
    <>
      <circle cx="12" cy="12" r="7.5" />
      <path d="M12 2.5v4M12 17.5v4M2.5 12h4M17.5 12h4" />
    </>
  ),
  "all-damage": (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3v18" />
    </>
  ),
  "area-damage": (
    <>
      <circle cx="12" cy="12" r="8.5" strokeDasharray="3 3" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  "splash-damage": (
    <>
      <circle cx="12" cy="14" r="4.5" />
      <path d="M12 4.5v3M6.5 7 8.5 9M17.5 7l-2 2M3 14.5h-1M22 14.5h-1" />
    </>
  ),
  bleed: (
    <>
      <path d="M4 4 13 13" />
      <path d="M17 14.5c1.6 2.1 2.5 3.2 2.5 4.3a2.5 2.5 0 0 1-5 0c0-1.1.9-2.2 2.5-4.3z" />
    </>
  ),
  fire: <path d="M12 2c1 4 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3 1-5 2 1 3 3 4 5 1-4-1-7 0-10z" />,
  holy: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" />
    </>
  ),
  electricity: <path d="M13 2 4 14h7l-1 8 9-12h-7z" />,
  acid: (
    <>
      <path d="M9 3v6l-5 9a2 2 0 0 0 1.8 3h12.4a2 2 0 0 0 1.8-3l-5-9V3" />
      <path d="M8 3h8" />
    </>
  ),
  poison: <path d="M12 3c3.5 4.5 6 7.2 6 10a6 6 0 0 1-12 0c0-2.8 2.5-5.5 6-10z" />,
  vitality: <path d="M12 20.5s-7-4.4-7-9a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11.5c0 4.6-7 9-7 9z" />,
  sonic: (
    <>
      <path d="M11 5 6 9H3v6h3l5 4z" />
      <path d="M15.5 8.5a5 5 0 0 1 0 7" />
      <path d="M18.5 5.5a9 9 0 0 1 0 13" />
    </>
  ),
  cold: <path d="M12 3v18M4.5 7.5l15 9M19.5 7.5l-15 9" />,
  spirit: <path d="M5 20V10a7 7 0 0 1 14 0v10l-3-2-2 2-2-2-2 2z" />,
  void: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="2.5" />
    </>
  ),
  mental: (
    <>
      <path d="M9 3a4 4 0 0 0-4 4 4 4 0 0 0 0 8 4 4 0 0 0 4 4V3z" />
      <path d="M15 3a4 4 0 0 1 4 4 4 4 0 0 1 0 8 4 4 0 0 1-4 4V3z" />
    </>
  ),
  force: (
    <>
      <path d="M4 12a8 8 0 0 1 16 0" />
      <path d="M7 16a5 5 0 0 1 10 0" />
      <circle cx="12" cy="19.5" r="1.5" />
    </>
  ),
  unholy: (
    <>
      <circle cx="12" cy="10" r="7" />
      <circle cx="9.5" cy="10" r="1.2" />
      <circle cx="14.5" cy="10" r="1.2" />
      <path d="M8.5 17.5v3M12 17.5v3M15.5 17.5v3" />
    </>
  ),
};

/**
 * The type's glyph, inheriting its colour from the surrounding chip
 * (`stroke="currentColor"`) so the two never drift apart. Renders nothing
 * for an unknown type — the label alone still says what it is.
 */
export function DamageTypeIcon({ type, size = 12 }: { type: string; size?: number }): React.ReactElement | null {
  const paths = ICON_PATHS[type];
  if (paths === undefined) return null;
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flexShrink: 0 }}
    >
      {paths}
    </svg>
  );
}
