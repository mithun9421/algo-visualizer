export type Ref = { kind: "ref"; id: string };
export type Primitive = string | number | boolean | null | undefined;
export type Value = Primitive | Ref;

export interface Frame {
  fnName: string;
  line: number;
  locals: Record<string, Value>;
}

export type HeapObjectType = "array" | "dict" | "object" | "instance";
export type ShapeHint = "linkedList" | "tree" | "graph";

export interface HeapObject {
  id: string;
  type: HeapObjectType;
  className?: string;
  fields: Record<string, Value>;
  hint?: ShapeHint;
}

export type TraceEventKind = "step" | "call" | "return" | "exception";

export interface TraceError {
  message: string;
  line: number;
}

export interface TraceEvent {
  step: number;
  line: number;
  event: TraceEventKind;
  stack: Frame[];
  heap: Record<string, HeapObject>;
  stdout: string;
  error?: TraceError;
}

export interface Diagnostic {
  line: number;
  col: number;
  message: string;
  severity: "error" | "warn";
}

export interface TraceResult {
  events: TraceEvent[];
  truncated: boolean;
  diagnostics: Diagnostic[];
}

export function isRef(v: Value): v is Ref {
  return typeof v === "object" && v !== null && (v as Ref).kind === "ref";
}
