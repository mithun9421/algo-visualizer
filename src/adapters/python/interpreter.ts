// Tree-walking interpreter for the Python subset.
// Emits one TraceEvent per executed statement.

import type {
  Module, Statement, Expr, AssignTarget,
  FunctionDef as FunctionDefNode,
} from "./ast";
import type {
  Frame, HeapObject, TraceEvent, TraceEventKind, TraceResult, Value,
} from "@/trace/types";
import { makeBuiltins, type BuiltinFn, type PyValue, displayString } from "./builtins";

class ReturnSignal { constructor(public value: PyValue) {} }
class BreakSignal {}
class ContinueSignal {}

interface PyFunction {
  __py_fn__: true;
  name: string;
  params: string[];
  body: Statement[];
  closure: Scope;
}

class Scope {
  vars = new Map<string, PyValue>();
  constructor(public parent: Scope | null, public fnName: string) {}

  lookup(name: string): { scope: Scope; value: PyValue } | null {
    if (this.vars.has(name)) return { scope: this, value: this.vars.get(name)! };
    if (this.parent) return this.parent.lookup(name);
    return null;
  }

  assign(name: string): Scope {
    // Python rule: assignment in current scope creates a local unless the
    // variable is already declared 'global' (not in subset). We always
    // write to current scope.
    return this;
  }
}

export interface RunOptions {
  maxSteps?: number;
}

const DEFAULT_MAX_STEPS = 10000;

export function run(module: Module, opts: RunOptions = {}): TraceResult {
  const maxSteps = opts.maxSteps ?? DEFAULT_MAX_STEPS;
  const events: TraceEvent[] = [];
  let stdoutBuf = "";
  const idMap = new Map<object, string>();
  let nextId = 1;
  let truncated = false;

  const stdoutAppend = (chunk: string) => { stdoutBuf += chunk; };
  const builtins = makeBuiltins(stdoutAppend);
  const globals = new Scope(null, "global");
  const callStack: Scope[] = [globals];

  function getRefId(obj: object): string {
    let id = idMap.get(obj);
    if (!id) { id = `p${nextId++}`; idMap.set(obj, id); }
    return id;
  }

  function reflectValue(v: PyValue, heap: Record<string, HeapObject>): Value {
    if (v === null) return null;
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return v;
    if (Array.isArray(v)) {
      const id = getRefId(v);
      if (heap[id]) return { kind: "ref", id };
      const fields: Record<string, Value> = {};
      heap[id] = { id, type: "array", fields };
      v.forEach((item, i) => {
        fields[String(i)] = reflectValue(item as PyValue, heap);
      });
      return { kind: "ref", id };
    }
    if (v && typeof v === "object") {
      const obj = v as Record<string, PyValue>;
      if ("__py_fn__" in obj) return undefined; // hide function values
      const id = getRefId(obj);
      if (heap[id]) return { kind: "ref", id };
      const fields: Record<string, Value> = {};
      heap[id] = { id, type: "dict", fields };
      for (const [k, val] of Object.entries(obj)) {
        fields[k] = reflectValue(val, heap);
      }
      return { kind: "ref", id };
    }
    return undefined;
  }

  function buildFrames(currentLine: number): { frames: Frame[]; heap: Record<string, HeapObject> } {
    const heap: Record<string, HeapObject> = {};
    const frames: Frame[] = callStack.map((sc) => {
      const locals: Record<string, Value> = {};
      for (const [name, v] of sc.vars) {
        if (v && typeof v === "object" && "__py_fn__" in (v as object)) continue;
        locals[name] = reflectValue(v, heap);
      }
      return { fnName: sc.fnName, line: currentLine, locals };
    });
    return { frames, heap };
  }

  function emit(line: number, kind: TraceEventKind): boolean {
    const stdoutDelta = stdoutBuf.slice(stdoutEmitted);
    stdoutEmitted = stdoutBuf.length;
    const { frames, heap } = buildFrames(line);
    events.push({
      step: events.length,
      line,
      event: kind,
      stack: frames,
      heap,
      stdout: stdoutDelta,
    });
    if (events.length >= maxSteps) { truncated = true; return false; }
    return true;
  }

  let stdoutEmitted = 0;

  function execStmt(stmt: Statement, scope: Scope): void {
    if (truncated) return;
    switch (stmt.type) {
      case "FunctionDef": {
        const fn: PyFunction = {
          __py_fn__: true,
          name: stmt.name,
          params: stmt.params,
          body: stmt.body,
          closure: scope,
        };
        scope.vars.set(stmt.name, fn as unknown as PyValue);
        if (!emit(stmt.loc.line, "step")) return;
        return;
      }
      case "Assign": {
        const v = evalExpr(stmt.value, scope);
        for (const tgt of stmt.targets) assignTo(tgt, v, scope);
        if (!emit(stmt.loc.line, "step")) return;
        return;
      }
      case "AugAssign": {
        const cur = readTarget(stmt.target, scope);
        const inc = evalExpr(stmt.value, scope);
        const next = applyBinOp(stmt.op, cur, inc);
        assignTo(stmt.target, next, scope);
        if (!emit(stmt.loc.line, "step")) return;
        return;
      }
      case "ExprStmt": {
        evalExpr(stmt.expr, scope);
        if (!emit(stmt.loc.line, "step")) return;
        return;
      }
      case "Return": {
        const v = stmt.value === null ? null : evalExpr(stmt.value, scope);
        if (!emit(stmt.loc.line, "return")) return;
        throw new ReturnSignal(v);
      }
      case "If": {
        if (!emit(stmt.loc.line, "step")) return;
        const t = evalExpr(stmt.test, scope);
        if (truthy(t)) execBlock(stmt.body, scope);
        else execBlock(stmt.orelse, scope);
        return;
      }
      case "While": {
        while (true) {
          if (!emit(stmt.loc.line, "step")) return;
          const t = evalExpr(stmt.test, scope);
          if (!truthy(t)) break;
          try { execBlock(stmt.body, scope); }
          catch (e) {
            if (e instanceof BreakSignal) return;
            if (e instanceof ContinueSignal) continue;
            throw e;
          }
        }
        return;
      }
      case "For": {
        const iter = evalExpr(stmt.iter, scope);
        if (!Array.isArray(iter)) throw new TypeError("for-iterable must be list/range");
        for (const item of iter) {
          scope.vars.set(stmt.target, item as PyValue);
          if (!emit(stmt.loc.line, "step")) return;
          try { execBlock(stmt.body, scope); }
          catch (e) {
            if (e instanceof BreakSignal) return;
            if (e instanceof ContinueSignal) continue;
            throw e;
          }
        }
        return;
      }
      case "Break":
        emit(stmt.loc.line, "step");
        throw new BreakSignal();
      case "Continue":
        emit(stmt.loc.line, "step");
        throw new ContinueSignal();
      case "Pass":
        emit(stmt.loc.line, "step");
        return;
    }
  }

  function execBlock(stmts: Statement[], scope: Scope): void {
    for (const s of stmts) {
      if (truncated) return;
      execStmt(s, scope);
    }
  }

  function evalExpr(expr: Expr, scope: Scope): PyValue {
    switch (expr.type) {
      case "Num": return expr.value;
      case "Str": return expr.value;
      case "Bool": return expr.value;
      case "None": return null;
      case "Name": {
        const found = scope.lookup(expr.name);
        if (found) return found.value;
        if (builtins.has(expr.name)) {
          // Wrap as a callable marker so Call can detect it
          return { __builtin__: expr.name } as unknown as PyValue;
        }
        throw new ReferenceError(`name '${expr.name}' is not defined`);
      }
      case "BinOp":
        return applyBinOp(expr.op, evalExpr(expr.left, scope), evalExpr(expr.right, scope));
      case "UnaryOp": {
        const v = evalExpr(expr.operand, scope);
        if (expr.op === "-") return -numeric(v);
        if (expr.op === "+") return +numeric(v);
        if (expr.op === "not") return !truthy(v);
        throw new TypeError(`bad unary op ${expr.op}`);
      }
      case "BoolOp": {
        const l = evalExpr(expr.left, scope);
        if (expr.op === "and") return truthy(l) ? evalExpr(expr.right, scope) : l;
        return truthy(l) ? l : evalExpr(expr.right, scope);
      }
      case "Compare":
        return applyCompare(expr.op, evalExpr(expr.left, scope), evalExpr(expr.right, scope));
      case "Call":
        return doCall(expr.callee, expr.args, scope);
      case "Subscript": {
        const obj = evalExpr(expr.obj, scope);
        const idx = evalExpr(expr.index, scope);
        return subscriptGet(obj, idx);
      }
      case "Attribute": {
        const obj = evalExpr(expr.obj, scope);
        return attributeGet(obj, expr.name);
      }
      case "List":
        return expr.items.map((it) => evalExpr(it, scope));
      case "Dict": {
        const out: Record<string, PyValue> = {};
        for (const { key, value } of expr.items) {
          const k = evalExpr(key, scope);
          out[String(k)] = evalExpr(value, scope);
        }
        return out;
      }
      case "Tuple":
        return expr.items.map((it) => evalExpr(it, scope));
    }
  }

  function doCall(calleeExpr: Expr, argsExpr: Expr[], scope: Scope): PyValue {
    // Method-call special case: list.append, etc.
    if (calleeExpr.type === "Attribute") {
      const recv = evalExpr(calleeExpr.obj, scope);
      const argVals = argsExpr.map((a) => evalExpr(a, scope));
      return invokeMethod(recv, calleeExpr.name, argVals);
    }
    const callee = evalExpr(calleeExpr, scope);
    const argVals = argsExpr.map((a) => evalExpr(a, scope));
    return invokeCallable(callee, argVals);
  }

  function invokeMethod(recv: PyValue, name: string, args: PyValue[]): PyValue {
    if (Array.isArray(recv)) {
      switch (name) {
        case "append": recv.push(args[0]); return null;
        case "pop": return args.length === 0 ? (recv.pop() as PyValue) ?? null : (recv.splice(numeric(args[0]), 1)[0] as PyValue) ?? null;
        case "extend": if (Array.isArray(args[0])) recv.push(...args[0]); return null;
        case "insert": recv.splice(numeric(args[0]), 0, args[1]); return null;
        case "remove": {
          const idx = recv.indexOf(args[0]);
          if (idx >= 0) recv.splice(idx, 1);
          return null;
        }
        case "index": return recv.indexOf(args[0]);
        case "count": return recv.filter((x) => x === args[0]).length;
        case "reverse": recv.reverse(); return null;
        case "sort": recv.sort((a, b) => Number(a) - Number(b)); return null;
      }
    }
    if (typeof recv === "string") {
      switch (name) {
        case "upper": return recv.toUpperCase();
        case "lower": return recv.toLowerCase();
        case "split": return recv.split(args[0] !== undefined ? String(args[0]) : " ");
        case "strip": return recv.trim();
      }
    }
    if (recv && typeof recv === "object" && !Array.isArray(recv)) {
      const dict = recv as Record<string, PyValue>;
      switch (name) {
        case "keys": return Object.keys(dict);
        case "values": return Object.values(dict) as PyValue[];
        case "get": return dict[String(args[0])] ?? (args[1] ?? null);
        case "items": return Object.entries(dict).map(([k, v]) => [k, v] as unknown as PyValue);
      }
    }
    throw new TypeError(`no method '${name}' on value`);
  }

  function invokeCallable(callee: PyValue, args: PyValue[]): PyValue {
    if (callee && typeof callee === "object" && "__builtin__" in (callee as object)) {
      const name = (callee as { __builtin__: string }).__builtin__;
      const fn = builtins.get(name) as BuiltinFn;
      return fn(args);
    }
    if (callee && typeof callee === "object" && "__py_fn__" in (callee as object)) {
      const fn = callee as unknown as PyFunction;
      const callScope = new Scope(fn.closure, fn.name);
      fn.params.forEach((p, i) => callScope.vars.set(p, args[i] ?? null));
      callStack.push(callScope);
      try {
        execBlock(fn.body, callScope);
      } catch (e) {
        if (e instanceof ReturnSignal) {
          callStack.pop();
          return e.value;
        }
        callStack.pop();
        throw e;
      }
      callStack.pop();
      return null;
    }
    throw new TypeError("object is not callable");
  }

  function assignTo(t: AssignTarget, v: PyValue, scope: Scope): void {
    if (t.type === "Name") {
      scope.assign(t.name).vars.set(t.name, v);
      return;
    }
    if (t.type === "Subscript") {
      const obj = evalExpr(t.obj, scope);
      const idx = evalExpr(t.index, scope);
      subscriptSet(obj, idx, v);
      return;
    }
    if (t.type === "Attribute") {
      const obj = evalExpr(t.obj, scope);
      if (obj && typeof obj === "object" && !Array.isArray(obj)) {
        (obj as Record<string, PyValue>)[t.name] = v;
        return;
      }
      throw new TypeError("attribute assignment requires dict-like object");
    }
  }

  function readTarget(t: AssignTarget, scope: Scope): PyValue {
    if (t.type === "Name") {
      const found = scope.lookup(t.name);
      return found ? found.value : null;
    }
    if (t.type === "Subscript") {
      return subscriptGet(evalExpr(t.obj, scope), evalExpr(t.index, scope));
    }
    if (t.type === "Attribute") {
      return attributeGet(evalExpr(t.obj, scope), t.name);
    }
    throw new Error("unreachable");
  }

  function subscriptGet(obj: PyValue, idx: PyValue): PyValue {
    if (Array.isArray(obj)) return (obj[numeric(idx)] as PyValue) ?? null;
    if (typeof obj === "string") return obj[numeric(idx)] ?? "";
    if (obj && typeof obj === "object") return (obj as Record<string, PyValue>)[String(idx)] ?? null;
    throw new TypeError("not subscriptable");
  }

  function subscriptSet(obj: PyValue, idx: PyValue, v: PyValue): void {
    if (Array.isArray(obj)) { obj[numeric(idx)] = v; return; }
    if (obj && typeof obj === "object") { (obj as Record<string, PyValue>)[String(idx)] = v; return; }
    throw new TypeError("not subscriptable");
  }

  function attributeGet(obj: PyValue, name: string): PyValue {
    if (obj && typeof obj === "object" && !Array.isArray(obj)) {
      return (obj as Record<string, PyValue>)[name] ?? null;
    }
    throw new TypeError(`attribute access not supported on this value`);
  }

  // execution
  try {
    for (const stmt of module.body) {
      if (truncated) break;
      execStmt(stmt, globals);
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const line = events[events.length - 1]?.line ?? 1;
    events.push({
      step: events.length,
      line,
      event: "exception",
      stack: buildFrames(line).frames,
      heap: buildFrames(line).heap,
      stdout: stdoutBuf.slice(stdoutEmitted),
      error: { message, line },
    });
  }

  // emit a final return event for the module if we haven't truncated
  if (!truncated && events.length > 0 && events[events.length - 1].event !== "exception") {
    emit(events[events.length - 1].line, "return");
  }

  return { events, truncated, diagnostics: [] };
}

function applyBinOp(op: string, a: PyValue, b: PyValue): PyValue {
  if (op === "+" && typeof a === "string" && typeof b === "string") return a + b;
  if (op === "+" && Array.isArray(a) && Array.isArray(b)) return [...a, ...b];
  const x = numeric(a);
  const y = numeric(b);
  switch (op) {
    case "+": return x + y;
    case "-": return x - y;
    case "*": return x * y;
    case "/": return x / y;
    case "//": return Math.floor(x / y);
    case "%": return ((x % y) + y) % y; // python-style modulo
    case "**": return Math.pow(x, y);
  }
  throw new TypeError(`bad binop ${op}`);
}

function applyCompare(op: string, a: PyValue, b: PyValue): boolean {
  switch (op) {
    case "==": return pyEquals(a, b);
    case "!=": return !pyEquals(a, b);
    case "<": return numeric(a) < numeric(b);
    case "<=": return numeric(a) <= numeric(b);
    case ">": return numeric(a) > numeric(b);
    case ">=": return numeric(a) >= numeric(b);
    case "is": return a === b;
    case "is not": return a !== b;
    case "in": {
      if (Array.isArray(b)) return b.some((x) => pyEquals(x as PyValue, a));
      if (typeof b === "string" && typeof a === "string") return b.includes(a);
      if (b && typeof b === "object") return String(a) in (b as object);
      return false;
    }
  }
  throw new TypeError(`bad compare ${op}`);
}

function pyEquals(a: PyValue, b: PyValue): boolean {
  if (a === b) return true;
  if (typeof a === "number" && typeof b === "number") return a === b;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((x, i) => pyEquals(x as PyValue, b[i] as PyValue));
  }
  return false;
}

function numeric(v: PyValue): number {
  if (typeof v === "number") return v;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (v === null) return 0;
  if (typeof v === "string") {
    const n = Number(v);
    if (Number.isNaN(n)) throw new TypeError(`cannot convert ${JSON.stringify(v)} to number`);
    return n;
  }
  throw new TypeError(`expected number, got ${typeof v}`);
}

function truthy(v: PyValue): boolean {
  if (v === null) return false;
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  if (typeof v === "string") return v.length > 0;
  if (Array.isArray(v)) return v.length > 0;
  if (v && typeof v === "object") return Object.keys(v as object).length > 0;
  return Boolean(v);
}

// keep displayString reachable from interpreter consumers if needed
export { displayString };
