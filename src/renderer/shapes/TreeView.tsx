"use client";

import { useMemo } from "react";
import dagre from "@dagrejs/dagre";
import type { HeapObject, Value } from "@/trace/types";
import { isRef } from "@/trace/types";
import type { TreeShape } from "@/inference/types";

const NODE_W = 56;
const NODE_H = 36;
const PADDING = 16;

interface PositionedNode {
  id: string;
  x: number;
  y: number;
}

interface PositionedEdge {
  from: PositionedNode;
  to: PositionedNode;
  label: string;
}

export default function TreeView({
  shape,
  heap,
}: {
  shape: TreeShape;
  heap: Record<string, HeapObject>;
}) {
  const { nodes, edges, width, height } = useMemo(() => {
    const g = new dagre.graphlib.Graph();
    g.setGraph({ rankdir: "TB", nodesep: 28, ranksep: 28 });
    g.setDefaultEdgeLabel(() => ({}));

    for (const id of shape.nodes) g.setNode(id, { width: NODE_W, height: NODE_H });
    for (const e of shape.edges) g.setEdge(e.from, e.to, { label: e.label });

    dagre.layout(g);

    const layoutNodes: PositionedNode[] = shape.nodes.map((id) => {
      const n = g.node(id);
      return { id, x: n.x, y: n.y };
    });
    const nodeById = new Map(layoutNodes.map((n) => [n.id, n]));
    const layoutEdges: PositionedEdge[] = shape.edges
      .map((e) => {
        const from = nodeById.get(e.from);
        const to = nodeById.get(e.to);
        if (!from || !to) return null;
        return { from, to, label: e.label };
      })
      .filter((x): x is PositionedEdge => x !== null);

    let maxX = 0;
    let maxY = 0;
    for (const n of layoutNodes) {
      if (n.x > maxX) maxX = n.x;
      if (n.y > maxY) maxY = n.y;
    }
    return {
      nodes: layoutNodes,
      edges: layoutEdges,
      width: maxX + NODE_W + PADDING * 2,
      height: maxY + NODE_H + PADDING * 2,
    };
  }, [shape]);

  return (
    <div className="overflow-auto">
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className="block"
      >
        <g transform={`translate(${PADDING},${PADDING})`}>
          {edges.map((e, i) => (
            <g key={i}>
              <line
                x1={e.from.x}
                y1={e.from.y + NODE_H / 2}
                x2={e.to.x}
                y2={e.to.y - NODE_H / 2}
                stroke="rgb(82,82,82)"
                strokeWidth="1.5"
              />
              <text
                x={(e.from.x + e.to.x) / 2 + 4}
                y={(e.from.y + e.to.y) / 2}
                fill="rgb(115,115,115)"
                fontSize={10}
                fontFamily="ui-monospace, Menlo, monospace"
              >
                {e.label.charAt(0)}
              </text>
            </g>
          ))}
          {nodes.map((n) => {
            const obj = heap[n.id];
            const val = obj?.fields.val;
            return (
              <g key={n.id} transform={`translate(${n.x - NODE_W / 2},${n.y - NODE_H / 2})`}>
                <rect
                  width={NODE_W}
                  height={NODE_H}
                  rx={6}
                  fill="rgb(23,23,23)"
                  stroke="rgb(64,64,64)"
                  strokeWidth="1"
                />
                <text
                  x={NODE_W / 2}
                  y={NODE_H / 2 - 2}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill="rgb(229,229,229)"
                  fontSize={12}
                  fontFamily="ui-monospace, Menlo, monospace"
                >
                  {renderVal(val)}
                </text>
                <text
                  x={NODE_W / 2}
                  y={NODE_H - 6}
                  textAnchor="middle"
                  fill="rgb(245,158,11)"
                  fontSize={8}
                  fontFamily="ui-monospace, Menlo, monospace"
                >
                  {n.id}
                </text>
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
}

function renderVal(v: Value | undefined): string {
  if (v === undefined) return "·";
  if (v === null) return "null";
  if (isRef(v)) return `→${v.id}`;
  if (typeof v === "string") return JSON.stringify(v);
  return String(v);
}
