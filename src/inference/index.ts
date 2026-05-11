import type { HeapObject } from "@/trace/types";
import { isRef } from "@/trace/types";
import type { AnyShape, ShapeKind } from "./types";
import { tryLinkedListFrom } from "./linkedList";
import { tryTreeFrom } from "./tree";
import { tryGraphFrom } from "./graph";

export type { AnyShape, ShapeKind } from "./types";

/**
 * Classify all heap objects into structures (linked lists, trees, graphs)
 * + standalone objects/arrays. Order in result is stable: linked lists first
 * (most specific), then trees, then graphs, then anything left.
 */
export function classifyHeap(
  heap: Record<string, HeapObject>,
  overrides: Record<string, ShapeKind> = {}
): AnyShape[] {
  const ids = Object.keys(heap);
  const incoming = buildIncomingRefMap(heap);
  const classified = new Set<string>();
  const shapes: AnyShape[] = [];

  const isRoot = (id: string) =>
    (incoming.get(id) ?? []).every((r) => heap[r.from]?.type !== "object");

  // Adapter hints have highest priority.
  for (const id of ids) {
    const hint = heap[id].hint;
    if (!hint) continue;
    if (hint === "linkedList") {
      const s = tryLinkedListFrom(id, heap);
      if (s) {
        shapes.push(s);
        s.chain.forEach((n) => classified.add(n));
      }
    } else if (hint === "tree") {
      const s = tryTreeFrom(id, heap);
      if (s) {
        shapes.push(s);
        s.nodes.forEach((n) => classified.add(n));
      }
    } else if (hint === "graph") {
      const s = tryGraphFrom(id, heap);
      if (s) {
        shapes.push(s);
        s.nodes.forEach((n) => classified.add(n));
      }
    }
  }

  // User overrides come next.
  for (const [id, want] of Object.entries(overrides)) {
    if (classified.has(id)) continue;
    if (!heap[id]) continue;
    const forced = forceShape(id, want, heap);
    if (forced) {
      shapes.push(forced);
      addClassified(forced, classified);
    }
  }

  // Auto: try linked-list roots first.
  for (const id of ids) {
    if (classified.has(id)) continue;
    if (heap[id].type !== "object") continue;
    if (!isRoot(id)) continue;
    const s = tryLinkedListFrom(id, heap);
    if (s) {
      shapes.push(s);
      s.chain.forEach((n) => classified.add(n));
    }
  }

  // Then trees.
  for (const id of ids) {
    if (classified.has(id)) continue;
    if (heap[id].type !== "object") continue;
    if (!isRoot(id)) continue;
    const s = tryTreeFrom(id, heap);
    if (s) {
      shapes.push(s);
      s.nodes.forEach((n) => classified.add(n));
    }
  }

  // Then graphs (any object — graphs can have cycles, so the "root" concept
  // is fuzzy; classify any unclassified object as the seed).
  for (const id of ids) {
    if (classified.has(id)) continue;
    if (heap[id].type !== "object") continue;
    const s = tryGraphFrom(id, heap);
    if (s) {
      shapes.push(s);
      s.nodes.forEach((n) => classified.add(n));
    }
  }

  // Everything left over → generic object.
  for (const id of ids) {
    if (classified.has(id)) continue;
    shapes.push({ kind: "object", id });
  }

  return shapes;
}

function forceShape(
  id: string,
  want: ShapeKind,
  heap: Record<string, HeapObject>
): AnyShape | null {
  if (want === "linkedList") return tryLinkedListFrom(id, heap);
  if (want === "tree") return tryTreeFrom(id, heap);
  if (want === "graph") return tryGraphFrom(id, heap);
  return { kind: "object", id };
}

function addClassified(shape: AnyShape, set: Set<string>): void {
  if (shape.kind === "linkedList") shape.chain.forEach((n) => set.add(n));
  else if (shape.kind === "tree" || shape.kind === "graph") shape.nodes.forEach((n) => set.add(n));
  else set.add(shape.id);
}

function buildIncomingRefMap(heap: Record<string, HeapObject>) {
  const map = new Map<string, { from: string; field: string }[]>();
  for (const [id, obj] of Object.entries(heap)) {
    for (const [field, value] of Object.entries(obj.fields)) {
      if (isRef(value)) {
        const list = map.get(value.id);
        const entry = { from: id, field };
        if (list) list.push(entry);
        else map.set(value.id, [entry]);
      }
    }
  }
  return map;
}
