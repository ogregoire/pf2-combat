import { useEffect, useLayoutEffect, useRef, useState } from "react";

/**
 * Hover text the GM can actually read, in place of the browser's `title`
 * (small, slow, unstyled). Any element carrying `data-hover` — a React
 * element through `hover()`, or markup in rules text — shows a card with
 * that text on mouse hover or keyboard focus. One layer for the whole app,
 * listening at the document, so text rendered as HTML gets it too.
 *
 * The text's shape: the first line is the heading; the lines after it, up
 * to a blank line, are short facts (a signed number in them is drawn green
 * or red, as everywhere else); what follows the blank line is the rules
 * text, one paragraph per line.
 */
export function hover(text: string | null | undefined): { "data-hover"?: string } {
  return text ? { "data-hover": text } : {};
}

/** The hover text for a number modifiers moved: `heading` (the stat and
 * its value), then one line per modifier — "−2 off-guard". Null when
 * nothing moved it. */
export function modifiersHover(heading: string, mods: { value: number; source: string }[]): string | null {
  if (mods.length === 0) return null;
  return [heading, ...mods.map((m) => `${m.value >= 0 ? "+" : "−"}${Math.abs(m.value)} ${m.source}`)].join("\n");
}

const SHOW_DELAY_MS = 120;
const GAP = 8;
const MARGIN = 12;

interface Shown {
  text: string;
  rect: DOMRect;
}

function hoverTarget(node: EventTarget | null): HTMLElement | null {
  return node instanceof Element ? (node.closest("[data-hover]") as HTMLElement | null) : null;
}

/** A fact line with its signed numbers coloured: "AC −2 · Reflex +1". */
function Fact({ line }: { line: string }): React.ReactElement {
  const parts = line.split(/((?:^|(?<=\s))[+−-]\d+\b)/);
  return (
    <div>
      {parts.map((p, i) =>
        /^[+−-]\d+$/.test(p) ? (
          <span key={i} style={{ color: p.startsWith("+") ? "var(--ok)" : "var(--danger)", fontWeight: 600 }}>
            {p}
          </span>
        ) : (
          p
        ),
      )}
    </div>
  );
}

export function HoverLayer(): React.ReactElement | null {
  const [shown, setShown] = useState<Shown | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const card = useRef<HTMLDivElement>(null);
  const current = useRef<HTMLElement | null>(null);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    const show = (el: HTMLElement): void => {
      current.current = el;
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => {
        const text = el.getAttribute("data-hover");
        if (text && el.isConnected) setShown({ text, rect: el.getBoundingClientRect() });
      }, SHOW_DELAY_MS);
    };
    const hide = (): void => {
      current.current = null;
      window.clearTimeout(timer.current);
      setShown(null);
    };
    const over = (e: Event): void => {
      const el = hoverTarget(e.target);
      if (el && el !== current.current) show(el);
    };
    const out = (e: Event): void => {
      const el = current.current;
      if (!el) return;
      const to = (e as MouseEvent | FocusEvent).relatedTarget;
      if (to instanceof Node && el.contains(to)) return;
      const next = hoverTarget(to);
      if (next) show(next);
      else hide();
    };
    document.addEventListener("mouseover", over);
    document.addEventListener("mouseout", out);
    document.addEventListener("focusin", over);
    document.addEventListener("focusout", out);
    // Anything that moves the page under the card would leave it adrift.
    window.addEventListener("scroll", hide, true);
    const key = (e: KeyboardEvent): void => {
      if (e.key === "Escape") hide();
    };
    window.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("mouseover", over);
      document.removeEventListener("mouseout", out);
      document.removeEventListener("focusin", over);
      document.removeEventListener("focusout", out);
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("keydown", key);
      window.clearTimeout(timer.current);
    };
  }, []);

  // Placed once measured: under the element, or above it when there's no
  // room below, and kept inside the viewport sideways.
  useLayoutEffect(() => {
    if (!shown || !card.current) {
      setPos(null);
      return;
    }
    const { width, height } = card.current.getBoundingClientRect();
    const { rect } = shown;
    const below = rect.bottom + GAP;
    const top = below + height + MARGIN > window.innerHeight && rect.top - GAP - height > MARGIN ? rect.top - GAP - height : below;
    const left = Math.min(Math.max(MARGIN, rect.left), Math.max(MARGIN, window.innerWidth - width - MARGIN));
    setPos({ left, top });
  }, [shown]);

  if (!shown) return null;
  const [heading = "", ...rest] = shown.text.split("\n");
  const blank = rest.indexOf("");
  const facts = (blank === -1 ? rest : rest.slice(0, blank)).filter(Boolean);
  const body = blank === -1 ? [] : rest.slice(blank + 1).filter(Boolean);

  return (
    <div
      ref={card}
      role="tooltip"
      data-testid="hover-card"
      style={{
        position: "fixed",
        left: pos?.left ?? 0,
        top: pos?.top ?? 0,
        visibility: pos ? "visible" : "hidden",
        zIndex: 100,
        pointerEvents: "none",
        maxWidth: "min(380px, calc(100vw - 24px))",
        padding: "10px 12px",
        borderRadius: "6px",
        background: "var(--panel-raised)",
        border: "1px solid var(--border-strong)",
        boxShadow: "0 8px 28px var(--shadow)",
        color: "var(--text)",
        fontFamily: "var(--font-ui)",
        fontSize: "13px",
        lineHeight: 1.45,
        letterSpacing: "normal",
        textTransform: "none",
        textAlign: "left",
        whiteSpace: "normal",
        fontWeight: 400,
      }}
    >
      <div style={{ fontWeight: 600, fontSize: "14px" }}>{heading}</div>
      {facts.length > 0 && (
        <div style={{ marginTop: "4px", display: "flex", flexDirection: "column", gap: "2px", fontSize: "12.5px" }}>
          {facts.map((f, i) => (
            <Fact key={i} line={f} />
          ))}
        </div>
      )}
      {body.length > 0 && (
        <div style={{ marginTop: "8px", paddingTop: "8px", borderTop: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: "6px", fontSize: "12.5px", color: "var(--text-dim)" }}>
          {body.map((p, i) => (
            <p key={i} style={{ margin: 0 }}>
              {p}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
