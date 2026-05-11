"use client";

import { useEffect } from "react";
import { usePlayerStore } from "./store";

/**
 * Drives auto-advance while the player is in 'playing' state.
 * Reads fresh state inside the rAF loop so it survives speed changes
 * and store updates without recreating the loop on every step.
 */
export function usePlayer(): void {
  const kind = usePlayerStore((s) => s.state.kind);

  useEffect(() => {
    if (kind !== "playing") return;

    let raf = 0;
    let last = 0;

    const tick = (now: number) => {
      const { state, dispatch } = usePlayerStore.getState();
      if (state.kind !== "playing") return;

      if (last === 0) last = now;
      // 1× = ~5 steps/sec (200ms/step). Speed select scales this:
      // 0.25× = 800ms, 0.5× = 400ms, 1× = 200ms, 2× = 100ms, 4× = 50ms.
      const interval = 200 / state.speed;

      if (now - last >= interval) {
        last = now;
        const nextIdx = state.index + 1;

        // breakpoint pause: if the step we're about to land on is a breakpoint, advance then pause
        if (nextIdx < state.trace.length && state.breakpoints.has(state.trace[nextIdx].line)) {
          dispatch({ type: "stepFwd" });
          dispatch({ type: "pause" });
          return;
        }
        dispatch({ type: "stepFwd" });
      }
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => {
      if (raf) cancelAnimationFrame(raf);
    };
  }, [kind]);
}
