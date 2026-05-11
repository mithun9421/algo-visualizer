"use client";

import { useMemo, useState } from "react";
import { usePlayerStore } from "@/player/store";
import { currentEvent } from "@/player/reducer";
import { classifyHeap } from "@/inference";
import type { AnyShape, ShapeKind } from "@/inference/types";
import ObjectView from "./shapes/ObjectView";
import LinkedListView from "./shapes/LinkedListView";
import TreeView from "./shapes/TreeView";
import GraphView from "./shapes/GraphView";

const OVERRIDE_OPTIONS: { value: "" | ShapeKind; label: string }[] = [
  { value: "", label: "auto" },
  { value: "object", label: "object" },
  { value: "linkedList", label: "list" },
  { value: "tree", label: "tree" },
  { value: "graph", label: "graph" },
];

export default function Heap() {
  const state = usePlayerStore((s) => s.state);
  const evt = currentEvent(state);
  const heap = evt?.heap ?? {};

  const [overrides, setOverrides] = useState<Record<string, ShapeKind>>({});

  const shapes = useMemo(() => classifyHeap(heap, overrides), [heap, overrides]);

  const setOverride = (id: string, kind: "" | ShapeKind) => {
    setOverrides((prev) => {
      const next = { ...prev };
      if (kind === "") delete next[id];
      else next[id] = kind;
      return next;
    });
  };

  return (
    <div className="flex h-full flex-col overflow-hidden bg-neutral-950">
      <div className="flex items-center justify-between border-b border-neutral-800 bg-neutral-900/50 px-3 py-1.5 text-xs">
        <span className="font-medium uppercase tracking-wider text-neutral-400">Heap</span>
        <span className="text-neutral-500">{shapes.length} structure{shapes.length === 1 ? "" : "s"}</span>
      </div>
      <div className="flex-1 overflow-auto p-3">
        {shapes.length === 0 ? (
          <p className="text-xs text-neutral-600">No heap objects in scope.</p>
        ) : (
          <ul className="space-y-3">
            {shapes.map((shape) => (
              <li
                key={shapeKey(shape)}
                className="rounded border border-neutral-800 bg-neutral-900/40 p-2.5"
              >
                <ShapeCard
                  shape={shape}
                  heap={heap}
                  override={overrides[shapeAnchor(shape)] ?? ""}
                  onOverride={(kind) => setOverride(shapeAnchor(shape), kind)}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function ShapeCard({
  shape,
  heap,
  override,
  onOverride,
}: {
  shape: AnyShape;
  heap: Parameters<typeof ObjectView>[0]["heap"];
  override: "" | ShapeKind;
  onOverride: (kind: "" | ShapeKind) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="font-mono text-neutral-500">
          <span className="text-amber-400">{shapeAnchor(shape)}</span>
          <span className="ml-2 text-neutral-600">{shapeBadge(shape)}</span>
        </span>
        <label className="flex items-center gap-1 text-[10px] text-neutral-500">
          render as
          <select
            value={override}
            onChange={(e) => onOverride(e.target.value as "" | ShapeKind)}
            className="rounded border border-neutral-700 bg-neutral-900 px-1 py-0.5 text-neutral-300"
          >
            {OVERRIDE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      {shape.kind === "linkedList" ? (
        <LinkedListView shape={shape} heap={heap} />
      ) : shape.kind === "tree" ? (
        <TreeView shape={shape} heap={heap} />
      ) : shape.kind === "graph" ? (
        <GraphView shape={shape} heap={heap} />
      ) : (
        <ObjectView obj={heap[shape.id]} heap={heap} />
      )}
    </div>
  );
}

function shapeAnchor(shape: AnyShape): string {
  return shape.kind === "object" ? shape.id : shape.rootId;
}

function shapeKey(shape: AnyShape): string {
  return `${shape.kind}:${shapeAnchor(shape)}`;
}

function shapeBadge(shape: AnyShape): string {
  switch (shape.kind) {
    case "linkedList":
      return `linked list · ${shape.chain.length} nodes (.${shape.nextField})`;
    case "tree":
      return `tree · ${shape.nodes.length} nodes`;
    case "graph":
      return `graph · ${shape.nodes.length} nodes, ${shape.edges.length} edges`;
    case "object":
      return "object";
  }
}
