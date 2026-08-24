import { useEffect, useState } from "react";

/** The single breakpoint the narrow (phone) layout switches on. Chosen
 * because the desktop layout's two fixed columns (340px list + 250px turn
 * manager) alone total 590px — below 900px the centre pane that's left over
 * drops under 320px, which is unusable, so the three-pane row is replaced by
 * tabs at that point instead of being squeezed further. */
export const NARROW_LAYOUT_QUERY = "(max-width: 900px)";

function readMatches(query: string): boolean {
  // This app is a client-only SPA (see main.tsx) so there's no true SSR
  // render to guard against, but the same "no window/matchMedia yet" shape
  // shows up in its test environment: jsdom implements neither `window`
  // absence nor `matchMedia` at all, so every existing (desktop) test that
  // doesn't stub it must still resolve to `false` here rather than throw.
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia(query).matches;
}

/**
 * Subscribes a component to a CSS media query, re-rendering whenever it
 * flips. The initial value is computed synchronously (not in an effect) so
 * the very first render already reflects reality instead of flashing the
 * wrong layout for one frame; the effect below only exists to keep it in
 * sync afterwards and to unsubscribe on unmount.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => readMatches(query));

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return undefined;
    const mql = window.matchMedia(query);
    setMatches(mql.matches);

    const listener = (e: MediaQueryListEvent): void => setMatches(e.matches);
    mql.addEventListener("change", listener);
    return () => mql.removeEventListener("change", listener);
  }, [query]);

  return matches;
}
