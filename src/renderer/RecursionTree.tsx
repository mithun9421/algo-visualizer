"use client";

import { useMemo } from "react";
import dagre from "@dagrejs/dagre";
import type { RecursionNode, RecursionTree as RecursionTreeData } from "@/trace/recursionTree";
import { statusAtStep, type NodeStatus } from "@/trace/recursionTree";
import type { Value } from "@/trace/types";
import { isRef } from "@/trace/types";
import { usePlayerStore } from "@/player/store";

const NODE_W = 112;
const NODE_H = 40;
const PADDING = 16;

interface PositionedNode {
  node: RecursionNode;
  x: number;
  y: number;
}

interface PositionedEdge {
  from: PositionedNode;
  to: PositionedNode;
}

export default function RecursionTreeView({
  tree,
  currentStep,
}: {
  tree: RecursionTreeData;
  currentStep: number;
}) {
  const dispatch = usePlayerStore((s) => s.dispatch);

  const { nodes, edges, width, height } = useMemo(() => layoutTree(tree), [tree]);
  const status = useMemo(() => statusAtStep(tree, currentStep), [tree, currentStep]);

  if (tree.nodes.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-4">
        <p className="text-xs text-neutral-600">No recursive calls in this trace.</p>
      </div>
    );
  }

  return (
    <div className="overflow-auto">
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="block">
        <g transform={`translate(${PADDING},${PADDING})`}>
          {edges.map((e, i) => (
            <line
              key={i}
              x1={e.from.x}
              y1={e.from.y + NODE_H / 2}
              x2={e.to.x}
              y2={e.to.y - NODE_H / 2}
              stroke="rgb(82,82,82)"
              strokeWidth="1.5"
              opacity={status.get(e.to.node.id) === "pending" ? 0.35 : 1}
            />
          ))}
          {nodes.map((n) => {
            const st = status.get(n.node.id) ?? "pending";
            return (
              <g
                key={n.node.id}
                transform={`translate(${n.x - NODE_W / 2},${n.y - NODE_H / 2})`}
                onClick={() => dispatch({ type: "seek", index: n.node.callStep })}
                style={{ cursor: "pointer" }}
              >
                <rect
                  width={NODE_W}
                  height={NODE_H}
                  rx={6}
                  fill="rgb(23,23,23)"
                  stroke={strokeColor(st)}
                  strokeWidth={st === "active" ? 2 : 1}
                  strokeDasharray={st === "pending" ? "3,3" : undefined}
                  opacity={st === "pending" ? 0.5 : 1}
                />
                <text
                  x={NODE_W / 2}
                  y={NODE_H / 2 - 4}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill={textColor(st)}
                  fontSize={11}
                  fontFamily="ui-monospace, Menlo, monospace"
                >
                  {n.node.fnName}({formatArgs(n.node.args)})
                </text>
                <text
                  x={NODE_W / 2}
                  y={NODE_H - 7}
                  textAnchor="middle"
                  fill="rgb(115,115,115)"
                  fontSize={8}
                  fontFamily="ui-monospace, Menlo, monospace"
                >
                  step {n.node.callStep}
                  {n.node.returnStep !== null ? `–${n.node.returnStep}` : "+"}
                </text>
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
}

function layoutTree(tree: RecursionTreeData): {
  nodes: PositionedNode[];
  edges: PositionedEdge[];
  width: number;
  height: number;
} {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: "TB", nodesep: 20, ranksep: 32 });
  g.setDefaultEdgeLabel(() => ({}));

  for (const node of tree.nodes) g.setNode(node.id, { width: NODE_W, height: NODE_H });
  for (const edge of tree.edges) g.setEdge(edge.from, edge.to);

  dagre.layout(g);

  const nodes: PositionedNode[] = tree.nodes.map((node) => {
    const pos = g.node(node.id);
    return { node, x: pos.x, y: pos.y };
  });
  const nodeById = new Map(nodes.map((n) => [n.node.id, n]));
  const edges: PositionedEdge[] = tree.edges
    .map((e) => {
      const from = nodeById.get(e.from);
      const to = nodeById.get(e.to);
      if (!from || !to) return null;
      return { from, to };
    })
    .filter((x): x is PositionedEdge => x !== null);

  let maxX = 0;
  let maxY = 0;
  for (const n of nodes) {
    if (n.x > maxX) maxX = n.x;
    if (n.y > maxY) maxY = n.y;
  }

  return {
    nodes,
    edges,
    width: maxX + NODE_W + PADDING * 2,
    height: maxY + NODE_H + PADDING * 2,
  };
}

function strokeColor(status: NodeStatus): string {
  switch (status) {
    case "active":
      return "rgb(16,185,129)"; // emerald-500
    case "done":
      return "rgb(82,82,82)"; // neutral-600
    case "pending":
      return "rgb(64,64,64)"; // neutral-700
  }
}

function textColor(status: NodeStatus): string {
  switch (status) {
    case "active":
      return "rgb(209,250,229)"; // emerald-100
    case "done":
      return "rgb(163,163,163)"; // neutral-400
    case "pending":
      return "rgb(82,82,82)"; // neutral-600
  }
}

function formatArgs(args: Record<string, Value>): string {
  return Object.entries(args)
    .map(([k, v]) => `${k}=${formatValue(v)}`)
    .join(", ");
}

function formatValue(v: Value): string {
  if (v === null) return "null";
  if (v === undefined) return "·";
  if (isRef(v)) return `→${v.id}`;
  if (typeof v === "string") return JSON.stringify(v);
  return String(v);
}
