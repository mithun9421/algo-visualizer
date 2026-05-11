"use client";

import { useEffect, useMemo, useRef } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { EditorView, Decoration, type DecorationSet, gutter, GutterMarker } from "@codemirror/view";
import { Compartment, EditorState, RangeSet, StateEffect, StateField } from "@codemirror/state";
import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";

import { usePlayerStore } from "@/player/store";
import { currentEvent } from "@/player/reducer";

const setBreakpointsEffect = StateEffect.define<ReadonlySet<number>>();
const setCurrentLineEffect = StateEffect.define<number>();

class BreakpointMarker extends GutterMarker {
  toDOM(): HTMLElement {
    const el = document.createElement("span");
    el.textContent = "●";
    el.style.color = "rgb(239,68,68)"; // red-500
    el.style.fontSize = "14px";
    el.style.lineHeight = "1";
    return el;
  }
}
const BP_MARKER = new BreakpointMarker();

const breakpointsField = StateField.define<ReadonlySet<number>>({
  create: () => new Set<number>(),
  update(value, tr) {
    for (const e of tr.effects) if (e.is(setBreakpointsEffect)) return e.value;
    return value;
  },
});

const currentLineField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(value, tr) {
    for (const e of tr.effects) {
      if (e.is(setCurrentLineEffect)) {
        const line = e.value;
        if (line <= 0 || line > tr.state.doc.lines) return Decoration.none;
        const lineFrom = tr.state.doc.line(line).from;
        return Decoration.set([
          Decoration.line({ attributes: { class: "cm-exec-line" } }).range(lineFrom),
        ]);
      }
    }
    return value.map(tr.changes);
  },
  provide: (f) => EditorView.decorations.from(f),
});

function makeBreakpointGutter(onToggle: (line: number) => void) {
  return gutter({
    class: "cm-breakpoint-gutter",
    markers(view) {
      const set = view.state.field(breakpointsField);
      const ranges = [...set]
        .filter((line) => line >= 1 && line <= view.state.doc.lines)
        .map((line) => BP_MARKER.range(view.state.doc.line(line).from))
        .sort((a, b) => a.from - b.from);
      return RangeSet.of(ranges, true);
    },
    domEventHandlers: {
      mousedown(view, lineBlock) {
        const line = view.state.doc.lineAt(lineBlock.from).number;
        onToggle(line);
        return true;
      },
    },
  });
}

const baseTheme = EditorView.theme(
  {
    "&": { height: "100%", fontSize: "13px", backgroundColor: "rgb(10,10,10)" },
    ".cm-scroller": {
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
      lineHeight: "1.55",
    },
    ".cm-gutters": {
      backgroundColor: "rgb(10,10,10)",
      borderRight: "1px solid rgb(38,38,38)",
      color: "rgb(115,115,115)",
    },
    ".cm-breakpoint-gutter": { width: "16px", cursor: "pointer" },
    ".cm-breakpoint-gutter:hover": { backgroundColor: "rgb(23,23,23)" },
    ".cm-exec-line": {
      backgroundColor: "rgba(16,185,129,0.12)",
      boxShadow: "inset 2px 0 0 rgb(16,185,129)",
    },
    ".cm-activeLine": { backgroundColor: "transparent" },
    ".cm-activeLineGutter": { backgroundColor: "transparent" },
    ".cm-content": { caretColor: "rgb(229,229,229)" },
  },
  { dark: true }
);

type Lang = "javascript" | "python";

interface CodePaneProps {
  source: string;
  onSourceChange: (next: string) => void;
  language?: Lang;
}

export default function CodePane({ source, onSourceChange, language = "javascript" }: CodePaneProps) {
  const dispatch = usePlayerStore((s) => s.dispatch);
  const breakpoints = usePlayerStore((s) => s.state.breakpoints);
  const stateKind = usePlayerStore((s) => s.state.kind);
  const currentLine = usePlayerStore((s) => currentEvent(s.state)?.line ?? -1);

  const viewRef = useRef<EditorView | null>(null);
  const readOnlyComp = useMemo(() => new Compartment(), []);
  const isPlaying = stateKind === "playing";

  const extensions = useMemo(
    () => [
      language === "python" ? python() : javascript(),
      breakpointsField,
      currentLineField,
      makeBreakpointGutter((line) => dispatch({ type: "toggleBreakpoint", line })),
      readOnlyComp.of(EditorState.readOnly.of(false)),
      baseTheme,
    ],
    [language, dispatch, readOnlyComp]
  );

  // mirror breakpoints from store → editor state
  useEffect(() => {
    viewRef.current?.dispatch({ effects: setBreakpointsEffect.of(breakpoints) });
  }, [breakpoints]);

  // mirror current execution line → line decoration
  useEffect(() => {
    viewRef.current?.dispatch({ effects: setCurrentLineEffect.of(currentLine) });
  }, [currentLine]);

  // toggle readOnly while playing
  useEffect(() => {
    viewRef.current?.dispatch({
      effects: readOnlyComp.reconfigure(EditorState.readOnly.of(isPlaying)),
    });
  }, [isPlaying, readOnlyComp]);

  return (
    <div className="flex h-full flex-col overflow-hidden bg-neutral-950">
      <div className="flex items-center justify-between border-b border-neutral-800 bg-neutral-900/50 px-3 py-1.5 text-xs">
        <span className="font-medium uppercase tracking-wider text-neutral-400">Code</span>
        <span className="text-neutral-500">
          {language === "python" ? "Python" : "JavaScript"}
          {isPlaying && <span className="ml-2 text-emerald-500">● playing (read-only)</span>}
        </span>
      </div>
      <div className="flex-1 overflow-hidden">
        <CodeMirror
          value={source}
          onChange={onSourceChange}
          extensions={extensions}
          theme="dark"
          basicSetup={{
            lineNumbers: true,
            highlightActiveLine: false,
            highlightActiveLineGutter: false,
            foldGutter: false,
          }}
          height="100%"
          style={{ height: "100%" }}
          onCreateEditor={(view) => {
            viewRef.current = view;
            view.dispatch({
              effects: [
                setBreakpointsEffect.of(breakpoints),
                setCurrentLineEffect.of(currentLine),
              ],
            });
          }}
        />
      </div>
    </div>
  );
}
