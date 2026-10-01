import { useEffect, useId, useState } from "react";
import { useT } from "../i18n/index.js";
import { useEncounter } from "../state/store.js";

/** The Union Flag, built the standard way (blue field, white and red
 * saltires clipped to the four quarters, white and red crosses on top).
 * Drawn, not an emoji: the glyph is "GB" text on some platforms and the
 * US flag is the emoji most people reach for by mistake. */
function UkFlag(): React.ReactElement {
  const clip = useId();
  return (
    <svg width="21" height="14" viewBox="0 0 60 30" preserveAspectRatio="none" aria-hidden="true" style={flagStyle}>
      <clipPath id={clip}>
        <path d="M30 15h30v15zv15H30zH0V15zV0h30z" />
      </clipPath>
      <path d="M0 0v30h60V0z" fill="#012169" />
      <path d="M0 0l60 30m0-30L0 30" stroke="#fff" strokeWidth="6" />
      <path d="M0 0l60 30m0-30L0 30" clipPath={`url(#${clip})`} stroke="#C8102E" strokeWidth="4" />
      <path d="M30 0v30M0 15h60" stroke="#fff" strokeWidth="10" />
      <path d="M30 0v30M0 15h60" stroke="#C8102E" strokeWidth="6" />
    </svg>
  );
}

function FrFlag(): React.ReactElement {
  return (
    <svg width="21" height="14" viewBox="0 0 3 2" preserveAspectRatio="none" aria-hidden="true" style={flagStyle}>
      <path d="M0 0h1v2H0z" fill="#0055A4" />
      <path d="M1 0h1v2H1z" fill="#fff" />
      <path d="M2 0h1v2H2z" fill="#EF4135" />
    </svg>
  );
}

const flagStyle: React.CSSProperties = {
  flexShrink: 0,
  borderRadius: "2px",
  boxShadow: "0 0 0 1px var(--border)",
};

function BurgerIcon(): React.ReactElement {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path d="M2 4.5h14M2 9h14M2 13.5h14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function PartyIcon(): React.ReactElement {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
    </svg>
  );
}

function CheckIcon(): React.ReactElement {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M3 8.4 6.4 11.6 13 5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const LANGUAGES: { code: "en" | "fr"; label: string; Flag: () => React.ReactElement }[] = [
  // Each language is named in itself, so it reads the same whichever one
  // is active — these are not translated strings.
  { code: "en", label: "English", Flag: UkFlag },
  { code: "fr", label: "Français", Flag: FrFlag },
];

const itemStyle: React.CSSProperties = {
  fontFamily: "inherit",
  fontSize: "14px",
  display: "flex",
  alignItems: "center",
  gap: "10px",
  width: "100%",
  padding: "9px 10px",
  borderRadius: "4px",
  border: "1px solid transparent",
  background: "transparent",
  color: "var(--text)",
  cursor: "pointer",
  textAlign: "left",
};

/**
 * The burger button at the top-left and the side menu it opens: the
 * supporting screens that are not part of running a fight (the party
 * roster) and the app's settings (language). Keeping them here, rather
 * than as buttons strewn across the header and the list pane, leaves those
 * for the encounter itself. The menu closes on a click outside it, on
 * Escape, or once an item has done its job.
 */
export function AppMenu({ onOpenParty }: { onOpenParty: () => void }): React.ReactElement {
  const t = useT();
  const lang = useEncounter((s) => s.lang);
  const setLang = useEncounter((s) => s.setLang);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        aria-label={t("MENU_ARIA")}
        aria-expanded={open}
        title={t("MENU_ARIA")}
        onClick={() => setOpen(true)}
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: "32px",
          height: "32px",
          padding: 0,
          borderRadius: "4px",
          border: "1px solid var(--border-strong)",
          background: "var(--panel-raised)",
          color: "var(--text)",
          cursor: "pointer",
          flexShrink: 0,
        }}
      >
        <BurgerIcon />
      </button>

      {open && (
        <div
          data-testid="menu-scrim"
          onClick={() => setOpen(false)}
          style={{ position: "fixed", inset: 0, background: "var(--scrim)", zIndex: 60 }}
        >
          <nav
            aria-label={t("MENU_ARIA")}
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              left: 0,
              width: "min(280px, 85vw)",
              background: "var(--bg)",
              borderRight: "1px solid var(--border-strong)",
              boxShadow: "16px 0 48px var(--shadow)",
              padding: "14px 14px 20px",
              display: "flex",
              flexDirection: "column",
              gap: "6px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
              <span style={{ fontFamily: "var(--font-display)", fontSize: "18px", fontWeight: 600 }}>{t("MENU_ARIA")}</span>
              <button
                type="button"
                aria-label={t("LABEL_CLOSE")}
                onClick={() => setOpen(false)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: "28px",
                  height: "28px",
                  padding: 0,
                  borderRadius: "3px",
                  border: "1px solid var(--border-strong)",
                  background: "var(--panel-raised)",
                  color: "var(--text-dim)",
                  cursor: "pointer",
                }}
              >
                <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
                  <path d="M2 2l10 10M12 2L2 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onOpenParty();
              }}
              style={itemStyle}
            >
              <PartyIcon />
              {t("PARTY_TITLE")}
            </button>

            <div
              style={{
                marginTop: "12px",
                paddingTop: "12px",
                borderTop: "1px solid var(--border)",
                fontSize: "10px",
                letterSpacing: "0.09em",
                textTransform: "uppercase",
                color: "var(--text-faint)",
                padding: "12px 10px 4px",
              }}
            >
              {t("LANGUAGE_LABEL")}
            </div>
            <div role="radiogroup" aria-label={t("LANGUAGE_LABEL")} style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
              {LANGUAGES.map(({ code, label, Flag }) => {
                const current = code === lang;
                return (
                  <button
                    key={code}
                    type="button"
                    role="radio"
                    aria-checked={current}
                    onClick={() => {
                      setLang(code);
                      setOpen(false);
                    }}
                    style={{ ...itemStyle, fontWeight: current ? 600 : 400, background: current ? "var(--select-bg)" : "transparent" }}
                  >
                    <Flag />
                    <span style={{ flexGrow: 1 }}>{label}</span>
                    {current && <CheckIcon />}
                  </button>
                );
              })}
            </div>
          </nav>
        </div>
      )}
    </>
  );
}
