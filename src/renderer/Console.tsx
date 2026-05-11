"use client";

import { useMemo } from "react";
import { usePlayerStore } from "@/player/store";

export default function Console() {
  const { state } = usePlayerStore();

  const accumulated = useMemo(() => {
    if (state.kind !== "paused" && state.kind !== "playing" && state.kind !== "finished") return "";
    const upto =
      state.kind === "finished" ? state.trace.length - 1 : state.index;
    let out = "";
    for (let i = 0; i <= upto; i++) out += state.trace[i]?.stdout ?? "";
    return out;
  }, [state]);

  return (
    <div className="flex h-full flex-col overflow-hidden bg-neutral-950">
      <PaneHeader title="Console" />
      <pre className="flex-1 overflow-auto whitespace-pre-wrap p-3 font-mono text-xs text-neutral-300">
        {accumulated || <span className="text-neutral-600">(no output yet)</span>}
      </pre>
    </div>
  );
}

function PaneHeader({ title }: { title: string }) {
  return (
    <div className="border-b border-neutral-800 bg-neutral-900/50 px-3 py-1.5 text-xs font-medium uppercase tracking-wider text-neutral-400">
      {title}
    </div>
  );
}
