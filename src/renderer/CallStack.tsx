"use client";

import { AnimatePresence, LayoutGroup, motion } from "framer-motion";
import { usePlayerStore } from "@/player/store";
import { currentEvent } from "@/player/reducer";
import Scope from "./Scope";
import type { Frame, TraceEvent } from "@/trace/types";

export default function CallStack() {
  const state = usePlayerStore((s) => s.state);
  const evt = currentEvent(state);
  const prevEvt = getPrev(state, evt);

  const frames = evt?.stack ?? [];
  const prevFrames = prevEvt?.stack ?? [];

  return (
    <div className="flex h-full flex-col overflow-hidden bg-neutral-950">
      <Header title="Call Stack + Scope" subtitle={evt?.event} />
      <div className="flex-1 overflow-auto p-3">
        {frames.length === 0 && (
          <p className="text-xs text-neutral-600">No active frame. Press Run.</p>
        )}
        <LayoutGroup id="call-stack">
          <AnimatePresence initial={false}>
            {[...frames].reverse().map((frame, displayIdx) => {
              const stackIdx = frames.length - 1 - displayIdx;
              const prev = matchPrevFrame(prevFrames, frame, stackIdx);
              return (
                <motion.div
                  key={`${stackIdx}-${frame.fnName}`}
                  layout
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ type: "spring", stiffness: 380, damping: 30 }}
                  className="mb-2"
                >
                  <FrameCard
                    frame={frame}
                    prev={prev}
                    heap={evt?.heap ?? {}}
                    step={evt?.step ?? 0}
                    isTop={displayIdx === 0}
                  />
                </motion.div>
              );
            })}
          </AnimatePresence>
        </LayoutGroup>
      </div>
    </div>
  );
}

function FrameCard({
  frame,
  prev,
  heap,
  step,
  isTop,
}: {
  frame: Frame;
  prev?: Frame;
  heap: Parameters<typeof Scope>[0]["heap"];
  step: number;
  isTop: boolean;
}) {
  return (
    <div
      className={
        "rounded border " +
        (isTop ? "border-emerald-700/60 bg-neutral-900" : "border-neutral-800 bg-neutral-900/40")
      }
    >
      <div className="flex items-center justify-between border-b border-neutral-800 px-2.5 py-1.5">
        <span className="font-mono text-sm text-emerald-400">{frame.fnName}()</span>
        <span className="font-mono text-xs text-neutral-500">line {frame.line}</span>
      </div>
      <div className="px-2.5 py-2">
        <Scope frame={frame} prev={prev} heap={heap} step={step} />
      </div>
    </div>
  );
}

function matchPrevFrame(
  prevFrames: Frame[],
  current: Frame,
  stackIdx: number
): Frame | undefined {
  // Same stack index AND same function name in the previous step.
  const candidate = prevFrames[stackIdx];
  if (candidate && candidate.fnName === current.fnName) return candidate;
  return undefined;
}

function getPrev(
  state: ReturnType<typeof usePlayerStore.getState>["state"],
  current: TraceEvent | undefined
): TraceEvent | undefined {
  if (!current) return undefined;
  if (state.kind !== "paused" && state.kind !== "playing" && state.kind !== "finished") return undefined;
  const trace = state.trace;
  const currIdx = current.step;
  if (currIdx <= 0) return undefined;
  return trace[currIdx - 1];
}

function Header({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="flex items-center justify-between border-b border-neutral-800 bg-neutral-900/50 px-3 py-1.5 text-xs">
      <span className="font-medium uppercase tracking-wider text-neutral-400">{title}</span>
      {subtitle && <span className="text-neutral-500">{subtitle}</span>}
    </div>
  );
}
