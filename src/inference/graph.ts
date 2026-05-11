import type { HeapObject, Value } from "@/trace/types";
import { isRef } from "@/trace/types";
import type { GraphShape } from "./types";

/**
 * Detects a graph component reachable from `rootId`.
 * Triggered when:
 *  - a node has an array-typed neighbors field (`adj`, `neighbors`, `edges`), OR
 *  - the reachable set contains a cycle through object→object refs.
 */
export function tryGraphFrom(
  rootId: string,
  heap: Record<string, HeapObject>
): GraphShape | null {
  const root = heap[rootId];
  if (!root || root.type !== "object") return null;

  const NEIGHBOR_FIELDS = new Set(["adj", "neighbors", "edges"]);

  const reachable = new Set<string>();
  const edges: { from: string; to: string }[] = [];
  const queue = [rootId];
  let foundCycle = false;
  let foundNeighborArray = false;

  while (queue.length > 0) {
    const id = queue.shift()!;
    if (reachable.has(id)) {
      foundCycle = true;
      continue;
    }
    reachable.add(id);

    const node = heap[id];
    if (!node || node.type !== "object") continue;

    for (const [field, value] of Object.entries(node.fields)) {
      if (isRef(value)) {
        const target = heap[value.id];
        if (!target) continue;

        if (NEIGHBOR_FIELDS.has(field) && target.type === "array") {
          foundNeighborArray = true;
          for (const entry of Object.values(target.fields)) {
            if (isRef(entry) && heap[entry.id]?.type === "object") {
              edges.push({ from: id, to: entry.id });
              queue.push(entry.id);
            }
          }
        } else if (target.type === "object") {
          edges.push({ from: id, to: value.id });
          queue.push(value.id);
        }
      } else {
        void (value as Value); // primitive
      }
    }
  }

  if (!foundCycle && !foundNeighborArray) return null;
  if (reachable.size < 2) return null;

  return { kind: "graph", rootId, nodes: [...reachable], edges };
}
