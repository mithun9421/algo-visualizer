"use client";

import type { HeapObject, Value } from "@/trace/types";
import { isRef } from "@/trace/types";

export default function ObjectView({
  obj,
  heap,
}: {
  obj: HeapObject;
  heap: Record<string, HeapObject>;
}) {
  const entries = Object.entries(obj.fields);

  if (obj.type === "array") {
    const indices = Object.keys(obj.fields)
      .filter((k) => /^\d+$/.test(k))
      .map(Number)
      .sort((a, b) => a - b);
    return (
      <div>
        <div className="mb-1 text-xs text-neutral-500">
          <span className="text-amber-400">{obj.id}</span>{" "}
          <span className="text-neutral-600">array · len {indices.length}</span>
        </div>
        <div className="flex flex-wrap gap-1">
          {indices.map((i) => (
            <div
              key={i}
              className="min-w-[32px] rounded border border-neutral-800 bg-neutral-950 px-2 py-1 text-center font-mono text-xs text-neutral-100"
            >
              {renderValue(obj.fields[String(i)], heap)}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-1 text-xs text-neutral-500">
        <span className="text-amber-400">{obj.id}</span>{" "}
        <span className="text-neutral-600">{obj.type}</span>
        {obj.className && <span className="ml-1 text-neutral-500">· {obj.className}</span>}
      </div>
      {entries.length === 0 ? (
        <div className="font-mono text-xs text-neutral-600">{"{}"}</div>
      ) : (
        <table className="w-full font-mono text-xs">
          <tbody>
            {entries.map(([k, v]) => (
              <tr key={k} className="border-b border-neutral-900 last:border-b-0">
                <td className="w-1/3 py-0.5 pr-2 text-neutral-400">{k}</td>
                <td className="py-0.5 text-neutral-100">{renderValue(v, heap)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function renderValue(v: Value, heap: Record<string, HeapObject>): string {
  if (isRef(v)) {
    const target = heap[v.id];
    return `→ ${v.id}${target ? ` (${target.type})` : ""}`;
  }
  if (v === undefined) return "undefined";
  if (v === null) return "null";
  if (typeof v === "string") return JSON.stringify(v);
  return String(v);
}
