import type { HeapObject, Value } from "@/trace/types";
import { isRef } from "@/trace/types";
import type { LinkedListShape } from "./types";

const LIST_FIELD_PRIORITY = ["next", "prev", "child", "sibling"] as const;

function selfTypedRefs(
  obj: HeapObject,
  heap: Record<string, HeapObject>
): [string, Value][] {
  return Object.entries(obj.fields).filter(([, v]) => {
    if (!isRef(v)) return false;
    const target = heap[v.id];
    return target?.type === "object";
  });
}

export function tryLinkedListFrom(
  rootId: string,
  heap: Record<string, HeapObject>
): LinkedListShape | null {
  const root = heap[rootId];
  if (!root || root.type !== "object") return null;

  const refs = selfTypedRefs(root, heap);
  if (refs.length !== 1) return null;

  let [field] = refs[0];
  // Prefer canonical field names if multiple candidates exist on later nodes.
  const named = LIST_FIELD_PRIORITY.find((n) => n === field);
  if (named) field = named;

  const chain: string[] = [rootId];
  const seen = new Set<string>([rootId]);
  let cur: Value = refs[0][1];

  while (isRef(cur)) {
    if (seen.has(cur.id)) return null; // cycle = not a list
    const node = heap[cur.id];
    if (!node || node.type !== "object") break;

    const nodeRefs = selfTypedRefs(node, heap);
    if (nodeRefs.length > 1) break;

    chain.push(cur.id);
    seen.add(cur.id);

    const nxt = node.fields[field];
    if (nxt === undefined || nxt === null) break;
    cur = nxt;
  }

  if (chain.length < 2) return null;
  return { kind: "linkedList", rootId, chain, nextField: field };
}
