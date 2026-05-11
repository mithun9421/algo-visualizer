import type { TraceEvent } from "@/trace/types";

export type PlayerState =
  | { kind: "idle"; breakpoints: ReadonlySet<number> }
  | { kind: "loading"; breakpoints: ReadonlySet<number> }
  | { kind: "paused"; index: number; trace: TraceEvent[]; breakpoints: ReadonlySet<number>; speed: number }
  | { kind: "playing"; index: number; trace: TraceEvent[]; breakpoints: ReadonlySet<number>; speed: number }
  | { kind: "finished"; trace: TraceEvent[]; breakpoints: ReadonlySet<number>; speed: number }
  | { kind: "error"; message: string; breakpoints: ReadonlySet<number> };

export type PlayerAction =
  | { type: "load"; events: TraceEvent[] }
  | { type: "loading" }
  | { type: "error"; message: string }
  | { type: "play" }
  | { type: "pause" }
  | { type: "stepFwd" }
  | { type: "stepBack" }
  | { type: "reset" }
  | { type: "seek"; index: number }
  | { type: "setSpeed"; speed: number }
  | { type: "toggleBreakpoint"; line: number };

export const DEFAULT_SPEED = 1; // steps per second multiplier

export const initialState: PlayerState = {
  kind: "idle",
  breakpoints: new Set<number>(),
};

function withToggledBreakpoint(set: ReadonlySet<number>, line: number): ReadonlySet<number> {
  const next = new Set(set);
  if (next.has(line)) next.delete(line);
  else next.add(line);
  return next;
}

function clampIndex(index: number, trace: TraceEvent[]): number {
  if (trace.length === 0) return 0;
  if (index < 0) return 0;
  if (index >= trace.length) return trace.length - 1;
  return index;
}

export function reducer(state: PlayerState, action: PlayerAction): PlayerState {
  switch (action.type) {
    case "toggleBreakpoint": {
      return { ...state, breakpoints: withToggledBreakpoint(state.breakpoints, action.line) };
    }

    case "loading":
      return { kind: "loading", breakpoints: state.breakpoints };

    case "error":
      return { kind: "error", message: action.message, breakpoints: state.breakpoints };

    case "load": {
      if (action.events.length === 0) {
        return { kind: "error", message: "Empty trace.", breakpoints: state.breakpoints };
      }
      return {
        kind: "paused",
        index: 0,
        trace: action.events,
        breakpoints: state.breakpoints,
        speed: "speed" in state ? state.speed : DEFAULT_SPEED,
      };
    }

    case "play": {
      if (state.kind === "paused") {
        return { ...state, kind: "playing" };
      }
      if (state.kind === "finished") {
        return { kind: "playing", index: 0, trace: state.trace, breakpoints: state.breakpoints, speed: state.speed };
      }
      return state;
    }

    case "pause": {
      if (state.kind === "playing") {
        return { ...state, kind: "paused" };
      }
      return state;
    }

    case "stepFwd": {
      if (state.kind !== "paused" && state.kind !== "playing") return state;
      const nextIndex = state.index + 1;
      if (nextIndex >= state.trace.length) {
        return {
          kind: "finished",
          trace: state.trace,
          breakpoints: state.breakpoints,
          speed: state.speed,
        };
      }
      // Preserve current kind (playing or paused) — the play loop relies on
      // this to keep ticking. Pausing on manual step is the responsibility
      // of the Pause button, not stepFwd.
      return { ...state, index: nextIndex };
    }

    case "stepBack": {
      if (state.kind !== "paused" && state.kind !== "playing" && state.kind !== "finished") return state;
      const trace = state.trace;
      if (state.kind === "finished") {
        return {
          kind: "paused",
          index: clampIndex(trace.length - 2, trace),
          trace,
          breakpoints: state.breakpoints,
          speed: state.speed,
        };
      }
      return { ...state, index: clampIndex(state.index - 1, trace) };
    }

    case "reset": {
      if (state.kind === "paused" || state.kind === "playing" || state.kind === "finished") {
        return {
          kind: "paused",
          index: 0,
          trace: state.trace,
          breakpoints: state.breakpoints,
          speed: state.speed,
        };
      }
      return state;
    }

    case "seek": {
      if (state.kind !== "paused" && state.kind !== "playing" && state.kind !== "finished") return state;
      const trace = state.trace;
      const idx = clampIndex(action.index, trace);
      if (state.kind === "finished") {
        return {
          kind: "paused",
          index: idx,
          trace,
          breakpoints: state.breakpoints,
          speed: state.speed,
        };
      }
      return { ...state, index: idx };
    }

    case "setSpeed": {
      if ("speed" in state) {
        return { ...state, speed: action.speed };
      }
      return state;
    }

    default:
      return state;
  }
}

export function hasBreakpointAt(state: PlayerState, line: number): boolean {
  return state.breakpoints.has(line);
}

export function currentEvent(state: PlayerState): TraceEvent | undefined {
  if (state.kind === "paused" || state.kind === "playing") {
    return state.trace[state.index];
  }
  if (state.kind === "finished") {
    return state.trace[state.trace.length - 1];
  }
  return undefined;
}
