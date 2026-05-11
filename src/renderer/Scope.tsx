"use client";

import type { Frame, HeapObject, Value } from "@/trace/types";
import { isRef } from "@/trace/types";
import { cn } from "@/lib/cn";
import { colorForName } from "@/lib/colors";

interface ScopeProps {
  frame: Frame;
  prev?: Frame;
  heap: Record<string, HeapObject>;
  step: number;
}

export default function Scope({ frame, prev, heap, step }: ScopeProps) {
  const entries = Object.entries(frame.locals);
  const scalars = entries.filter(([, v]) => !isRef(v));
  const refs = entries.filter(([, v]) => isRef(v)) as [string, { kind: "ref"; id: string }][];

  const changed = computeChangedKeys(frame.locals, prev?.locals);
  const indexHints = computeIndexHints(frame, heap);

  return (
    <div className="space-y-2">
      {scalars.length > 0 && (
        <table className="w-full font-mono text-xs">
          <tbody>
            {scalars.map(([name, value]) => {
              const didChange = changed.has(name);
              // Re-key on step when the value changed so the CSS animation re-fires.
              const rowKey = didChange ? `${name}-${step}` : name;
              return (
                <tr
                  key={rowKey}
                  className={cn(
                    "border-b border-neutral-900 last:border-b-0",
                    didChange && "av-flash"
                  )}
                >
                  <td className="w-1/3 py-0.5 pr-2 text-neutral-400">{name}</td>
                  <td className="py-0.5 text-neutral-100">{renderScalar(value)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {refs.map(([name, ref]) => {
        const obj = heap[ref.id];
        if (!obj) {
          return (
            <div key={name} className="text-xs">
              <span className="text-neutral-400">{name}</span>{" "}
              <span className="text-amber-400">→ {ref.id} (missing)</span>
            </div>
          );
        }
        return (
          <div key={name} className="space-y-1">
            <div className="flex items-baseline gap-2 text-xs">
              <span className="text-neutral-400">{name}</span>
              <span className="text-neutral-600">=</span>
              <span className="font-mono text-amber-400">→ {ref.id}</span>
              <span className="text-[10px] text-neutral-600">{obj.type}</span>
            </div>
            {obj.type === "array" ? (
              <ArrayInline
                obj={obj}
                hints={indexHints.get(obj.id) ?? new Map()}
                changedKeys={changedHeapKeys(obj, prev ? findRefIn(prev, name)?.id : undefined, heap)}
                step={step}
              />
            ) : (
              <ObjectInline obj={obj} heap={heap} />
            )}
          </div>
        );
      })}

      {scalars.length === 0 && refs.length === 0 && (
        <p className="text-xs text-neutral-600">(no locals)</p>
      )}
    </div>
  );
}

function findRefIn(frame: Frame, name: string): { kind: "ref"; id: string } | undefined {
  const v = frame.locals[name];
  if (v && isRef(v)) return v;
  return undefined;
}

function changedHeapKeys(
  obj: HeapObject,
  prevId: string | undefined,
  _heap: Record<string, HeapObject>
): Set<string> {
  // We don't carry the previous-step heap into Scope; for now we don't
  // diff array contents here. Phase 6 (Framer Motion) will handle smooth
  // transitions; for Phase 4 it's enough to flash the array container.
  void prevId;
  void obj;
  return new Set();
}

function ArrayInline({
  obj,
  hints,
  step,
}: {
  obj: HeapObject;
  hints: Map<number, string[]>;
  changedKeys: Set<string>;
  step: number;
}) {
  const indices = Object.keys(obj.fields)
    .filter((k) => /^\d+$/.test(k))
    .map(Number)
    .sort((a, b) => a - b);

  if (indices.length === 0) {
    return <div className="text-xs text-neutral-600">(empty array)</div>;
  }

  return (
    <div className="flex flex-wrap gap-1" key={`arr-${obj.id}-${step}`}>
      {indices.map((idx) => {
        const v = obj.fields[String(idx)];
        const ptrs = hints.get(idx) ?? [];
        return (
          <div key={idx} className="flex flex-col items-center">
            <div className="min-w-[32px] rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-center font-mono text-xs text-neutral-100">
              {renderScalar(v)}
            </div>
            <div className="mt-0.5 text-[10px] text-neutral-600">{idx}</div>
            <div className="mt-0.5 flex flex-wrap justify-center gap-0.5">
              {ptrs.map((name) => (
                <span
                  key={name}
                  className="rounded px-1 text-[10px] font-semibold text-black"
                  style={{ backgroundColor: colorForName(name) }}
                  title={`${name} = ${idx}`}
                >
                  {name}
                </span>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ObjectInline({ obj, heap }: { obj: HeapObject; heap: Record<string, HeapObject> }) {
  const entries = Object.entries(obj.fields);
  if (entries.length === 0) {
    return <div className="text-xs text-neutral-600">{"{}"}</div>;
  }
  return (
    <table className="w-full font-mono text-xs">
      <tbody>
        {entries.map(([k, v]) => (
          <tr key={k} className="border-b border-neutral-900 last:border-b-0">
            <td className="w-1/3 py-0.5 pr-2 text-neutral-400">{k}</td>
            <td className="py-0.5 text-neutral-100">
              {isRef(v) ? (
                <span className="text-amber-400">
                  → {v.id}
                  {heap[v.id] ? (
                    <span className="ml-2 text-[10px] text-neutral-600">{heap[v.id].type}</span>
                  ) : null}
                </span>
              ) : (
                renderScalar(v)
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function renderScalar(v: Value): string {
  if (isRef(v)) return `→ ${v.id}`;
  if (v === undefined) return "undefined";
  if (v === null) return "null";
  if (typeof v === "string") return JSON.stringify(v);
  return String(v);
}

function computeChangedKeys(
  curr: Record<string, Value>,
  prev?: Record<string, Value>
): Set<string> {
  if (!prev) return new Set(Object.keys(curr));
  const out = new Set<string>();
  for (const k of Object.keys(curr)) {
    const a = curr[k];
    const b = prev[k];
    if (!Object.prototype.hasOwnProperty.call(prev, k) || !valEq(a, b)) out.add(k);
  }
  return out;
}

function valEq(a: Value, b: Value): boolean {
  if (a === b) return true;
  if (isRef(a) && isRef(b)) return a.id === b.id;
  return false;
}

function computeIndexHints(
  frame: Frame,
  heap: Record<string, HeapObject>
): Map<string, Map<number, string[]>> {
  const out = new Map<string, Map<number, string[]>>();

  const arrays: { id: string; len: number }[] = [];
  for (const v of Object.values(frame.locals)) {
    if (isRef(v)) {
      const obj = heap[v.id];
      if (obj && obj.type === "array") {
        const len = Object.keys(obj.fields).filter((k) => /^\d+$/.test(k)).length;
        arrays.push({ id: v.id, len });
        out.set(v.id, new Map());
      }
    }
  }

  for (const [name, v] of Object.entries(frame.locals)) {
    if (typeof v !== "number" || !Number.isInteger(v)) continue;
    for (const { id, len } of arrays) {
      if (v >= 0 && v < len) {
        const m = out.get(id)!;
        if (!m.has(v)) m.set(v, []);
        m.get(v)!.push(name);
        break;
      }
    }
  }
  return out;
}
