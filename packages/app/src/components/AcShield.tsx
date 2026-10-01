import { useT } from "../i18n/index.js";

/**
 * A creature's Armor Class drawn as a number inside a shield, in place of
 * the "AC 25" / "CA 25" text. The shield is the universal glyph for the
 * stat, so the label needs no translation — but the accessible name keeps
 * the localised "AC 25" so a screen reader (and a test) still reads it.
 *
 * Only RollAssistant's target box uses it so far; the stat block header,
 * the list rows and the popover still spell the label out.
 */
export function AcShield({ ac, size = 28 }: { ac: number; size?: number }): React.ReactElement {
  const t = useT();
  return (
    <svg
      role="img"
      aria-label={`${t("LABEL_AC")} ${ac}`}
      width={size}
      height={size * (28 / 24)}
      viewBox="0 0 24 28"
      style={{ flexShrink: 0, display: "block" }}
    >
      <path
        d="M12 1.2 L21.8 4.8 V13 C21.8 19.6 17.6 24.6 12 26.8 C6.4 24.6 2.2 19.6 2.2 13 V4.8 Z"
        fill="var(--panel-raised)"
        stroke="var(--text)"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <text
        x="12"
        y="14.2"
        textAnchor="middle"
        dominantBaseline="central"
        fontFamily="var(--font-mono)"
        fontSize={ac >= 100 ? 8.5 : 11}
        fontWeight="600"
        fill="var(--text)"
      >
        {ac}
      </text>
    </svg>
  );
}
