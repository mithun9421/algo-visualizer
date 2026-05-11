import type { HeapObject } from "@/trace/types";
import { isRef } from "@/trace/types";
import type { TreeShape } from "./types";

const BINARY_FIELDS = ["left", "right"] as const;

export function tryTreeFrom(
  rootId: string,
  heap: Record<string, HeapObject>
): TreeShape | null {
  const root = heap[rootId];
  if (!root || root.type !== "object") return null;

  const hasChildField = BINARY_FIELDS.some((f) => f in root.fields);
  if (!hasChildField) return null;

  const nodes: string[] = [];
  const edges: { from: string; to: string; label: string }[] = [];
  const seen = new Set<string>();
  const queue: string[] = [rootId];

  while (queue.length > 0) {
    const id = queue.shift()!;
    if (seen.has(id)) return null; // cycle = not a tree
    seen.add(id);
    nodes.push(id);

    const node = heap[id];
    if (!node || node.type !== "object") continue;

    for (const field of BINARY_FIELDS) {
      const v = node.fields[field];
      if (isRef(v) && heap[v.id]?.type === "object") {
        edges.push({ from: id, to: v.id, label: field });
        queue.push(v.id);
      }
    }
  }

  if (nodes.length < 2) return null;
  return { kind: "tree", rootId, nodes, edges, childFields: [...BINARY_FIELDS] };
}
