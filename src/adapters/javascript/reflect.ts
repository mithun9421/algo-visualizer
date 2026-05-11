import type { HeapObject, Value } from "@/trace/types";

// Names always present on the global scope from js-interpreter that we want
// to suppress when rendering "your variables".
export const BUILTIN_GLOBALS = new Set<string>([
  "NaN",
  "Infinity",
  "undefined",
  "window",
  "self",
  "this",
  "globalThis",
  "console",
  "Array",
  "Object",
  "Number",
  "String",
  "Boolean",
  "Math",
  "JSON",
  "Date",
  "RegExp",
  "Error",
  "TypeError",
  "SyntaxError",
  "ReferenceError",
  "RangeError",
  "URIError",
  "EvalError",
  "Function",
  "Symbol",
  "parseInt",
  "parseFloat",
  "isNaN",
  "isFinite",
  "encodeURI",
  "decodeURI",
  "encodeURIComponent",
  "decodeURIComponent",
  "arguments",
]);

type PseudoObj = {
  properties: Record<string, unknown>;
  class?: string;
};

export interface Reflector {
  reflect(raw: unknown, heap: Record<string, HeapObject>): Value;
}

export function makeReflector(): Reflector {
  const idMap = new Map<object, string>();

  function reflect(raw: unknown, heap: Record<string, HeapObject>): Value {
    if (raw === null) return null;
    if (raw === undefined) return undefined;

    const t = typeof raw;
    if (t === "number" || t === "string" || t === "boolean") return raw as Value;

    if (t === "function") return "[function]"; // js-interpreter wraps fns as pseudo-fns; rare to surface here

    if (t === "object") {
      const obj = raw as PseudoObj;
      if (!obj.properties) return undefined;

      // skip function objects in the heap — they show up as values in scope but we don't render them
      if (obj.class === "Function") return "[function]";

      let id = idMap.get(obj);
      if (id && heap[id]) return { kind: "ref", id };

      if (!id) {
        id = `h${idMap.size + 1}`;
        idMap.set(obj, id);
      }

      const isArray = obj.class === "Array";
      const fields: Record<string, Value> = {};
      // Insert placeholder first to break cycles.
      heap[id] = {
        id,
        type: isArray ? "array" : "object",
        fields,
      };

      for (const k of Object.keys(obj.properties)) {
        if (isArray && k === "length") continue;
        fields[k] = reflect(obj.properties[k], heap);
      }

      return { kind: "ref", id };
    }

    return undefined;
  }

  return { reflect };
}

export function displayString(v: unknown, depth = 0): string {
  if (v === null) return "null";
  if (v === undefined) return "undefined";
  const t = typeof v;
  if (t === "string") return v as string;
  if (t === "number" || t === "boolean") return String(v);
  if (depth > 3) return "…";
  if (t === "object") {
    const obj = v as PseudoObj;
    if (!obj.properties) return "[?]";
    if (obj.class === "Array") {
      const items: string[] = [];
      const len = Number((obj.properties as Record<string, unknown>).length ?? 0);
      for (let i = 0; i < len && i < 20; i++) {
        items.push(displayString(obj.properties[String(i)], depth + 1));
      }
      if (len > 20) items.push("…");
      return "[" + items.join(", ") + "]";
    }
    const entries: string[] = [];
    for (const k of Object.keys(obj.properties)) {
      entries.push(`${k}: ${displayString(obj.properties[k], depth + 1)}`);
      if (entries.length >= 8) {
        entries.push("…");
        break;
      }
    }
    return "{" + entries.join(", ") + "}";
  }
  return String(v);
}
