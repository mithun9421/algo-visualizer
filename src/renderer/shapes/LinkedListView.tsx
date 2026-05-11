"use client";

import { LayoutGroup, motion } from "framer-motion";
import type { HeapObject, Value } from "@/trace/types";
import { isRef } from "@/trace/types";
import type { LinkedListShape } from "@/inference/types";

export default function LinkedListView({
  shape,
  heap,
}: {
  shape: LinkedListShape;
  heap: Record<string, HeapObject>;
}) {
  return (
    <LayoutGroup id={`ll-${shape.rootId}`}>
      <div className="overflow-x-auto">
        <div className="flex items-stretch gap-0">
          {shape.chain.map((id, i) => {
            const node = heap[id];
            const dataFields = node
              ? Object.entries(node.fields).filter(([k]) => k !== shape.nextField)
              : [];
            return (
              <div key={id} className="flex items-center">
                <motion.div
                  layoutId={`node-${id}`}
                  layout
                  transition={{ type: "spring", stiffness: 350, damping: 30 }}
                  className="flex flex-col rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-center"
                >
                  {dataFields.length === 0 ? (
                    <span className="font-mono text-xs text-neutral-100">{id}</span>
                  ) : (
                    dataFields.map(([k, v]) => (
                      <span key={k} className="font-mono text-xs text-neutral-100">
                        {k === "val" ? renderVal(v) : `${k}: ${renderVal(v)}`}
                      </span>
                    ))
                  )}
                  <span className="mt-0.5 text-[10px] text-amber-400">{id}</span>
                </motion.div>
                {i < shape.chain.length - 1 && (
                  <span className="px-1 font-mono text-neutral-400">→</span>
                )}
              </div>
            );
          })}
          <span className="ml-1 self-center font-mono text-neutral-500">→ null</span>
        </div>
      </div>
    </LayoutGroup>
  );
}

function renderVal(v: Value): string {
  if (isRef(v)) return `→ ${v.id}`;
  if (v === undefined) return "undefined";
  if (v === null) return "null";
  if (typeof v === "string") return JSON.stringify(v);
  return String(v);
}
