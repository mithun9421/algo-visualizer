"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { usePlayerStore } from "@/player/store";
import { usePlayer } from "@/player/usePlayer";
import { initAdapters } from "@/adapters/init";
import { getAdapter } from "@/adapters/registry";
import { JS_SAMPLES, SAMPLE_BUBBLE_SORT } from "@/samples/javascript";
import { decodeShare, encodeShare } from "@/trace/serialize";
import { cn } from "@/lib/cn";
import Controls from "./Controls";
import CodePane from "./CodePane";
import CallStack from "./CallStack";
import Heap from "./Heap";
import ConsolePane from "./Console";

initAdapters();

export default function Visualizer() {
  const dispatch = usePlayerStore((s) => s.dispatch);
  const stateKind = usePlayerStore((s) => s.state.kind);
  const traceLen = usePlayerStore((s) =>
    "trace" in s.state ? s.state.trace.length : 0
  );
  const traceTruncated = usePlayerStore((s) =>
    "trace" in s.state ? (s.state as { trace: unknown[] }).trace.length >= 10000 : false
  );

  const [source, setSource] = useState<string>(SAMPLE_BUBBLE_SORT);
  const [sampleKey, setSampleKey] = useState<string>("bubbleSort");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [shareNotice, setShareNotice] = useState<string | null>(null);
  const lastTracedRef = useRef<string | null>(null);

  usePlayer();

  // Hydrate from URL hash if present (#d=<base64>) — runs once on mount.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const hash = window.location.hash.replace(/^#/, "");
    if (!hash.startsWith("d=")) return;
    const encoded = hash.slice(2);
    const payload = decodeShare(encoded);
    if (payload && payload.lang === "javascript") {
      setSource(payload.source);
      setSampleKey("custom");
    }
  }, []);

  const onShare = useCallback(() => {
    if (typeof window === "undefined") return;
    const encoded = encodeShare({ v: 1, lang: "javascript", source });
    const url = `${window.location.origin}${window.location.pathname}#d=${encoded}`;
    window.history.replaceState(null, "", `#d=${encoded}`);
    if (navigator.clipboard) {
      void navigator.clipboard.writeText(url).then(
        () => {
          setShareNotice("Share URL copied to clipboard.");
          setTimeout(() => setShareNotice(null), 2200);
        },
        () => setShareNotice(`Copy failed — URL: ${url}`)
      );
    } else {
      setShareNotice(`URL: ${url}`);
    }
  }, [source]);

  const runTrace = useCallback(
    async (code: string) => {
      const adapter = getAdapter("javascript");
      if (!adapter) {
        setErrorMsg("JS adapter not registered.");
        return;
      }
      dispatch({ type: "loading" });
      setErrorMsg(null);
      lastTracedRef.current = code;
      const result = await adapter.trace(code);
      if (result.diagnostics.length > 0) {
        const d = result.diagnostics[0];
        setErrorMsg(`Parse error (line ${d.line}:${d.col}): ${d.message}`);
        dispatch({ type: "error", message: d.message });
        return;
      }
      if (result.events.length === 0) {
        setErrorMsg("Code produced no executable statements.");
        dispatch({ type: "error", message: "Empty trace" });
        return;
      }
      dispatch({ type: "load", events: result.events });
    },
    [dispatch]
  );

  // Auto-run: initial mount immediate, edits debounced 400ms.
  // Skips when source matches the last traced version.
  useEffect(() => {
    if (source === lastTracedRef.current) return;
    const delay = lastTracedRef.current === null ? 0 : 400;
    const handle = setTimeout(() => {
      void runTrace(source);
    }, delay);
    return () => clearTimeout(handle);
  }, [source, runTrace]);

  const onSampleChange = (key: string): void => {
    setSampleKey(key);
    const s = JS_SAMPLES.find((x) => x.key === key);
    if (s) setSource(s.source);
  };

  const isStale = source !== lastTracedRef.current && lastTracedRef.current !== null;

  return (
    <div className="flex h-screen flex-col">
      <Header
        sampleKey={sampleKey}
        onSampleChange={onSampleChange}
        onRun={() => void runTrace(source)}
        onShare={onShare}
        running={stateKind === "loading"}
        stale={isStale}
      />
      {shareNotice && (
        <div className="border-b border-emerald-900 bg-emerald-950/60 px-3 py-1.5 text-xs text-emerald-300">
          {shareNotice}
        </div>
      )}
      {errorMsg && (
        <div className="border-b border-red-900 bg-red-950/60 px-3 py-1.5 font-mono text-xs text-red-300">
          {errorMsg}
        </div>
      )}
      {traceTruncated && (
        <div className="border-b border-amber-900 bg-amber-950/60 px-3 py-1.5 text-xs text-amber-300">
          Execution truncated at {traceLen.toLocaleString()} steps.
        </div>
      )}
      <Controls />
      <div className="flex-1 overflow-hidden">
        <PanelGroup direction="vertical">
          <Panel defaultSize={75} minSize={30}>
            <PanelGroup direction="horizontal">
              <Panel defaultSize={55} minSize={25}>
                <CodePane source={source} onSourceChange={setSource} />
              </Panel>
              <ResizeH />
              <Panel defaultSize={45} minSize={20}>
                <PanelGroup direction="vertical">
                  <Panel defaultSize={50} minSize={15}>
                    <CallStack />
                  </Panel>
                  <ResizeV />
                  <Panel defaultSize={50} minSize={15}>
                    <Heap />
                  </Panel>
                </PanelGroup>
              </Panel>
            </PanelGroup>
          </Panel>
          <ResizeV />
          <Panel defaultSize={25} minSize={10}>
            <ConsolePane />
          </Panel>
        </PanelGroup>
      </div>
    </div>
  );
}

interface HeaderProps {
  sampleKey: string;
  onSampleChange: (key: string) => void;
  onRun: () => void;
  onShare: () => void;
  running: boolean;
  stale: boolean;
}

function Header({ sampleKey, onSampleChange, onRun, onShare, running, stale }: HeaderProps) {
  return (
    <header className="flex items-center justify-between gap-3 border-b border-neutral-800 bg-neutral-950 px-4 py-2">
      <h1 className="text-sm font-semibold tracking-tight text-neutral-100">
        Algorithm Visualizer
        <span className="ml-2 text-xs font-normal text-neutral-500">Phase 4 — JS adapter (MVP)</span>
      </h1>
      <div className="flex items-center gap-2 text-xs">
        <label className="flex items-center gap-1 text-neutral-400">
          Sample
          <select
            value={sampleKey}
            onChange={(e) => onSampleChange(e.target.value)}
            className="rounded border border-neutral-700 bg-neutral-900 px-1.5 py-0.5 text-neutral-200"
          >
            {JS_SAMPLES.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <span className="text-neutral-600">·</span>
        <span className="text-neutral-500">JavaScript (ES5)</span>
        <button
          onClick={onRun}
          disabled={running}
          className={cn(
            "rounded border px-2.5 py-1 transition-colors",
            stale
              ? "border-amber-600 bg-amber-900/40 text-amber-200 hover:bg-amber-900/70"
              : "border-emerald-700 bg-emerald-900/40 text-emerald-200 hover:bg-emerald-900/70",
            "disabled:cursor-not-allowed disabled:opacity-50"
          )}
          title={stale ? "Re-tracing soon (auto-run on edit)" : "Re-run trace"}
        >
          {running ? "Running…" : stale ? "Re-trace ▶" : "Run ▶"}
        </button>
        <button
          onClick={onShare}
          className="rounded border border-neutral-700 bg-neutral-900 px-2.5 py-1 text-neutral-200 transition-colors hover:border-neutral-600 hover:bg-neutral-800"
          title="Copy a sharable URL of the current code"
        >
          Share
        </button>
      </div>
    </header>
  );
}

function ResizeH() {
  return <PanelResizeHandle className="w-px bg-neutral-800 transition-colors hover:bg-emerald-600" />;
}
function ResizeV() {
  return <PanelResizeHandle className="h-px bg-neutral-800 transition-colors hover:bg-emerald-600" />;
}
