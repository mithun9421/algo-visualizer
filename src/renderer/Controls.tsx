"use client";

import { usePlayerStore } from "@/player/store";
import { cn } from "@/lib/cn";

const SPEEDS = [0.25, 0.5, 1, 2, 4] as const;

export default function Controls() {
  const { state, dispatch } = usePlayerStore();

  const hasTrace = state.kind === "paused" || state.kind === "playing" || state.kind === "finished";
  const isPlaying = state.kind === "playing";
  const traceLen = hasTrace ? state.trace.length : 0;
  const index = state.kind === "paused" || state.kind === "playing" ? state.index : state.kind === "finished" ? traceLen - 1 : 0;
  const speed = "speed" in state ? state.speed : 1;

  return (
    <div className="flex items-center gap-2 border-b border-neutral-800 bg-neutral-950 px-3 py-2 text-sm">
      <Btn onClick={() => dispatch({ type: "stepBack" })} disabled={!hasTrace || index <= 0}>
        ⏮ Back
      </Btn>
      {isPlaying ? (
        <Btn onClick={() => dispatch({ type: "pause" })} disabled={!hasTrace}>
          ⏸ Pause
        </Btn>
      ) : (
        <Btn onClick={() => dispatch({ type: "play" })} disabled={!hasTrace}>
          ▶ Play
        </Btn>
      )}
      <Btn
        onClick={() => {
          if (isPlaying) dispatch({ type: "pause" });
          dispatch({ type: "stepFwd" });
        }}
        disabled={!hasTrace || state.kind === "finished"}
      >
        Step ⏭
      </Btn>
      <Btn onClick={() => dispatch({ type: "reset" })} disabled={!hasTrace}>
        ⟲ Reset
      </Btn>

      <div className="mx-3 h-5 w-px bg-neutral-800" />

      <label className="flex items-center gap-1 text-neutral-400">
        Speed
        <select
          value={speed}
          onChange={(e) => dispatch({ type: "setSpeed", speed: Number(e.target.value) })}
          disabled={!hasTrace}
          className="rounded border border-neutral-700 bg-neutral-900 px-1.5 py-0.5 text-neutral-200 disabled:opacity-50"
        >
          {SPEEDS.map((s) => (
            <option key={s} value={s}>
              {s}×
            </option>
          ))}
        </select>
      </label>

      <div className="mx-3 h-5 w-px bg-neutral-800" />

      <input
        type="range"
        min={0}
        max={Math.max(0, traceLen - 1)}
        value={index}
        onChange={(e) => dispatch({ type: "seek", index: Number(e.target.value) })}
        disabled={!hasTrace}
        className="w-48 accent-emerald-500 disabled:opacity-50"
      />
      <span className="font-mono text-xs text-neutral-400">
        {hasTrace ? `${index + 1} / ${traceLen}` : "— / —"}
      </span>

      <div className="ml-auto text-xs text-neutral-500">
        {state.kind === "error" ? `Error: ${state.message}` : state.kind}
      </div>
    </div>
  );
}

function Btn({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "rounded border border-neutral-700 bg-neutral-900 px-2.5 py-1 text-neutral-200 transition-colors",
        "hover:border-neutral-600 hover:bg-neutral-800",
        "disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-neutral-700 disabled:hover:bg-neutral-900"
      )}
    >
      {children}
    </button>
  );
}
