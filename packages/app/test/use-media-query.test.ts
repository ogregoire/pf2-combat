import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useMediaQuery } from "../src/hooks/useMediaQuery.js";

// jsdom doesn't implement matchMedia at all, so every test here stubs it
// explicitly — this is also what pins the "no matchMedia -> false" fallback
// every *other* test file in this suite silently relies on (they render the
// desktop layout without ever touching window.matchMedia).

type Listener = (e: MediaQueryListEvent) => void;

function stubMatchMedia(initialMatches: boolean): { fire: (matches: boolean) => void } {
  let matches = initialMatches;
  let listener: Listener | null = null;
  const mql = {
    get matches() {
      return matches;
    },
    media: "",
    addEventListener: (_type: string, l: Listener) => {
      listener = l;
    },
    removeEventListener: () => {
      listener = null;
    },
  };
  vi.stubGlobal("matchMedia", vi.fn().mockReturnValue(mql));
  return {
    fire: (next: boolean) => {
      matches = next;
      listener?.({ matches: next } as MediaQueryListEvent);
    },
  };
}

describe("useMediaQuery", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("falls back to false when matchMedia doesn't exist (this suite's default jsdom environment)", () => {
    const { result } = renderHook(() => useMediaQuery("(max-width: 900px)"));
    expect(result.current).toBe(false);
  });

  it("reflects a true match on the very first render, not just after an effect", () => {
    stubMatchMedia(true);
    const { result } = renderHook(() => useMediaQuery("(max-width: 900px)"));
    expect(result.current).toBe(true);
  });

  it("updates when the media query's match state changes", () => {
    const control = stubMatchMedia(false);
    const { result } = renderHook(() => useMediaQuery("(max-width: 900px)"));
    expect(result.current).toBe(false);

    act(() => control.fire(true));
    expect(result.current).toBe(true);

    act(() => control.fire(false));
    expect(result.current).toBe(false);
  });

  it("unsubscribes on unmount", () => {
    const removeEventListener = vi.fn();
    const addEventListener = vi.fn();
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockReturnValue({ matches: false, media: "", addEventListener, removeEventListener }),
    );

    const { unmount } = renderHook(() => useMediaQuery("(max-width: 900px)"));
    expect(addEventListener).toHaveBeenCalledWith("change", expect.any(Function));
    unmount();
    expect(removeEventListener).toHaveBeenCalledWith("change", expect.any(Function));
  });
});
