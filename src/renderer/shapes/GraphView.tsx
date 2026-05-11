"use client";

import { useEffect, useRef } from "react";
import type { HeapObject, Value } from "@/trace/types";
import { isRef } from "@/trace/types";
import type { GraphShape } from "@/inference/types";

const HEIGHT = 280;

export default function GraphView({
  shape,
  heap,
}: {
  shape: GraphShape;
  heap: Record<string, HeapObject>;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let destroyed = false;
    let cyInstance: { destroy: () => void } | null = null;

    (async () => {
      const [{ default: cytoscape }, { default: fcose }] = await Promise.all([
        import("cytoscape"),
        import("cytoscape-fcose"),
      ]);
      if (destroyed || !containerRef.current) return;
      try {
        cytoscape.use(fcose);
      } catch {
        // already registered (HMR)
      }

      const elements = [
        ...shape.nodes.map((id) => ({
          data: { id, label: nodeLabel(id, heap[id]?.fields.val) },
        })),
        ...shape.edges.map((e, i) => ({
          data: { id: `e${i}`, source: e.from, target: e.to },
        })),
      ];

      const cy = cytoscape({
        container: containerRef.current,
        elements,
        style: [
          {
            selector: "node",
            style: {
              "background-color": "#171717",
              "border-color": "#404040",
              "border-width": 1,
              label: "data(label)",
              color: "#e5e5e5",
              "font-size": 11,
              "font-family": "ui-monospace, Menlo, monospace",
              "text-valign": "center",
              "text-halign": "center",
              width: 44,
              height: 44,
            },
          },
          {
            selector: "edge",
            style: {
              "curve-style": "bezier",
              "target-arrow-shape": "triangle",
              "line-color": "#525252",
              "target-arrow-color": "#525252",
              width: 1.2,
            },
          },
        ],
        layout: {
          name: "fcose",
          animate: false,
          padding: 20,
          nodeSeparation: 80,
        } as unknown as cytoscape.LayoutOptions,
      });
      cyInstance = cy;
    })();

    return () => {
      destroyed = true;
      cyInstance?.destroy();
    };
  }, [shape, heap]);

  return (
    <div
      ref={containerRef}
      style={{ height: HEIGHT }}
      className="w-full rounded border border-neutral-800 bg-neutral-950"
    />
  );
}

function nodeLabel(id: string, val: Value | undefined): string {
  if (val === undefined) return id;
  if (val === null) return "null";
  if (isRef(val)) return id;
  if (typeof val === "string") return JSON.stringify(val);
  return String(val);
}
