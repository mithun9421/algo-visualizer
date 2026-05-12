// Built-in functions available in the Python subset.

export type PyValue = number | string | boolean | null | PyList | PyDict;
export type PyList = unknown[]; // tagged via WeakMap in interpreter
export type PyDict = Record<string, unknown>;

export type BuiltinFn = (args: PyValue[]) => PyValue;

export function makeBuiltins(stdoutAppend: (chunk: string) => void): Map<string, BuiltinFn> {
  const m = new Map<string, BuiltinFn>();

  m.set("print", (args) => {
    const parts = args.map(displayString);
    stdoutAppend(parts.join(" ") + "\n");
    return null;
  });

  m.set("len", (args) => {
    const v = args[0];
    if (Array.isArray(v)) return v.length;
    if (typeof v === "string") return v.length;
    if (v && typeof v === "object") return Object.keys(v as object).length;
    throw new TypeError(`object has no len()`);
  });

  m.set("range", (args) => {
    let start = 0;
    let stop = 0;
    let step = 1;
    if (args.length === 1) stop = numeric(args[0]);
    else if (args.length === 2) { start = numeric(args[0]); stop = numeric(args[1]); }
    else if (args.length >= 3) { start = numeric(args[0]); stop = numeric(args[1]); step = numeric(args[2]) || 1; }
    const out: number[] = [];
    if (step > 0) for (let i = start; i < stop; i += step) out.push(i);
    else if (step < 0) for (let i = start; i > stop; i += step) out.push(i);
    return out;
  });

  m.set("abs", (args) => Math.abs(numeric(args[0])));
  m.set("min", (args) => Math.min(...args.map(numeric)));
  m.set("max", (args) => Math.max(...args.map(numeric)));
  m.set("sum", (args) => {
    const v = args[0];
    if (!Array.isArray(v)) throw new TypeError("sum() expects a list");
    return v.reduce<number>((acc, x) => acc + numeric(x as PyValue), 0);
  });
  m.set("sorted", (args) => {
    const v = args[0];
    if (!Array.isArray(v)) throw new TypeError("sorted() expects a list");
    return [...v].sort((a, b) => {
      const an = a as PyValue;
      const bn = b as PyValue;
      if (typeof an === "number" && typeof bn === "number") return an - bn;
      return String(an).localeCompare(String(bn));
    });
  });
  m.set("reversed", (args) => {
    const v = args[0];
    if (!Array.isArray(v)) throw new TypeError("reversed() expects a list");
    return [...v].reverse();
  });

  m.set("int", (args) => Math.trunc(numeric(args[0])));
  m.set("str", (args) => displayString(args[0]));
  m.set("float", (args) => numeric(args[0]));
  m.set("bool", (args) => Boolean(args[0]));
  m.set("list", (args) => Array.isArray(args[0]) ? [...args[0]] : []);
  m.set("dict", () => ({}));
  m.set("tuple", (args) => Array.isArray(args[0]) ? [...args[0]] : []);

  return m;
}

function numeric(v: PyValue): number {
  if (typeof v === "number") return v;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (typeof v === "string") {
    const n = Number(v);
    if (Number.isNaN(n)) throw new TypeError(`cannot convert ${JSON.stringify(v)} to number`);
    return n;
  }
  throw new TypeError(`expected number, got ${typeof v}`);
}

export function displayString(v: PyValue, depth = 0): string {
  if (v === null) return "None";
  if (typeof v === "boolean") return v ? "True" : "False";
  if (typeof v === "string") return depth === 0 ? v : JSON.stringify(v);
  if (typeof v === "number") return String(v);
  if (depth > 3) return "…";
  if (Array.isArray(v)) {
    return "[" + v.map((x) => displayString(x as PyValue, depth + 1)).join(", ") + "]";
  }
  if (v && typeof v === "object") {
    const entries = Object.entries(v as PyDict).map(
      ([k, x]) => `${JSON.stringify(k)}: ${displayString(x as PyValue, depth + 1)}`
    );
    return "{" + entries.join(", ") + "}";
  }
  return String(v);
}
