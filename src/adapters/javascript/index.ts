import type { LanguageAdapter } from "../types";
import type {
  Frame,
  HeapObject,
  TraceEvent,
  TraceEventKind,
  TraceResult,
  Value,
} from "@/trace/types";
import { BUILTIN_GLOBALS, displayString, makeReflector } from "./reflect";
import { downlevelLetConst } from "./downlevel";
import { SAMPLE_BUBBLE_SORT } from "@/samples/javascript";

const DEFAULT_MAX_STEPS = 10000;

interface ScopeLike {
  object: { properties: Record<string, unknown> };
  parentScope?: ScopeLike;
}

interface StateLike {
  node?: {
    type: string;
    loc?: { start?: { line: number; column: number } };
    id?: { name?: string };
  };
  scope?: ScopeLike;
  func_?: {
    node?: { id?: { name?: string }; type?: string };
  };
  // js-interpreter's internal phase counter for If/ConditionalExpression
  // states (both share stepConditionalExpression). Phase 2 means the
  // test already ran and the branch already ran — the state is only kept
  // around to be popped, with no further work. Reading this lets us skip
  // that pop-only "closing" revisit; if a future js-interpreter version
  // renames or drops the field, mode_ is simply undefined and we fall
  // back to the old (safe, if slightly noisier) behavior.
  mode_?: number;
}

function uniqueScopes(stack: StateLike[]): ScopeLike[] {
  const seen = new Set<ScopeLike>();
  const out: ScopeLike[] = [];
  for (const state of stack) {
    if (state.scope && !seen.has(state.scope)) {
      seen.add(state.scope);
      out.push(state.scope);
    }
  }
  return out;
}

function findFnNameForScope(stack: StateLike[], scope: ScopeLike): string | undefined {
  // The CallExpression state (one level shallower) that established this scope
  // carries a func_ with the function definition node.
  let scopeFirstIdx = -1;
  for (let i = 0; i < stack.length; i++) {
    if (stack[i].scope === scope) {
      scopeFirstIdx = i;
      break;
    }
  }
  if (scopeFirstIdx <= 0) return undefined;
  for (let i = scopeFirstIdx - 1; i >= 0; i--) {
    const s = stack[i];
    if (s.func_?.node?.id?.name) return s.func_.node.id.name;
  }
  return undefined;
}

function buildFrames(
  stack: StateLike[],
  reflect: (raw: unknown, heap: Record<string, HeapObject>) => Value,
  heap: Record<string, HeapObject>
): Frame[] {
  const scopes = uniqueScopes(stack);
  const frames: Frame[] = [];

  scopes.forEach((scope, depth) => {
    const props = scope.object?.properties ?? {};
    const locals: Record<string, Value> = {};
    for (const k of Object.keys(props)) {
      if (BUILTIN_GLOBALS.has(k)) continue;
      const v = reflect(props[k], heap);
      // Skip locals that resolved to "[function]" — they're noise
      if (v === "[function]") continue;
      locals[k] = v;
    }

    const fnName = depth === 0 ? "global" : findFnNameForScope(stack, scope) ?? "<anonymous>";

    // Use the topmost state belonging to this scope for the frame line.
    let frameLine = 0;
    for (let i = stack.length - 1; i >= 0; i--) {
      if (stack[i].scope === scope && stack[i].node?.loc?.start) {
        frameLine = stack[i].node!.loc!.start!.line;
        break;
      }
    }

    frames.push({ fnName, line: frameLine, locals });
  });

  // Innermost frame goes last so renderers can pop the top easily.
  return frames;
}

export const javascriptAdapter: LanguageAdapter = {
  id: "javascript",
  displayName: "JavaScript",
  fileExtension: "js",
  defaultSample: SAMPLE_BUBBLE_SORT,

  async trace(source, opts): Promise<TraceResult> {
    const maxSteps = opts?.maxSteps ?? DEFAULT_MAX_STEPS;

    // Dynamic import: js-interpreter touches global identifiers and is
    // safest to load lazily on first use (always client-side in our app).
    const InterpreterMod = await import("js-interpreter");
    const Interpreter =
      (InterpreterMod as unknown as { default: unknown }).default ?? InterpreterMod;
    const InterpreterCtor = Interpreter as new (
      code: string,
      initFunc?: (interpreter: unknown, globalObject: unknown) => void
    ) => {
      step(): boolean;
      getStateStack(): StateLike[];
      nativeToPseudo(value: unknown): unknown;
      setProperty(obj: unknown, name: string, value: unknown): void;
      createNativeFunction(fn: (...args: unknown[]) => unknown): unknown;
    };

    let stdoutBuf = "";
    const initFn = (interp: unknown, globalObj: unknown) => {
      const i = interp as {
        nativeToPseudo: (v: unknown) => unknown;
        setProperty: (obj: unknown, name: string, value: unknown) => void;
        createNativeFunction: (fn: (...args: unknown[]) => unknown) => unknown;
      };
      const consoleObj = i.nativeToPseudo({});
      i.setProperty(globalObj, "console", consoleObj);
      const logFn = i.createNativeFunction((...args: unknown[]) => {
        const parts = args.map((a) => displayString(a));
        stdoutBuf += parts.join(" ") + "\n";
        return undefined;
      });
      i.setProperty(consoleObj, "log", logFn);
    };

    // The bundled interpreter only understands ES5; downlevel `let`/`const`
    // to `var` (same-length rewrite, so lines/columns still line up with
    // the source shown in the editor) so modern-looking sample code runs
    // instead of failing to parse.
    const es5Source = downlevelLetConst(source);

    let interpInstance: InstanceType<typeof InterpreterCtor>;
    try {
      interpInstance = new InterpreterCtor(es5Source, initFn);
    } catch (e) {
      const err = e as { message?: string; loc?: { line?: number; column?: number } };
      return {
        events: [],
        truncated: false,
        diagnostics: [
          {
            line: err.loc?.line ?? 1,
            col: err.loc?.column ?? 0,
            message: err.message ?? "Parse error",
            severity: "error",
          },
        ],
      };
    }

    const reflector = makeReflector();
    const events: TraceEvent[] = [];
    let lastLine = -1;
    let lastDepth = -1;
    let stdoutEmitted = 0;
    let stepCount = 0;
    let truncated = false;
    let alive = true;

    const STATEMENT_TYPES = new Set([
      "VariableDeclaration",
      "ExpressionStatement",
      "ReturnStatement",
      "IfStatement",
      "ForStatement",
      "ForInStatement",
      "WhileStatement",
      "DoWhileStatement",
      "BreakStatement",
      "ContinueStatement",
      "FunctionDeclaration",
    ]);

    // js-interpreter re-surfaces these container nodes as the top of the
    // state stack in between each of their children (e.g. after every
    // statement inside a `{ ... }` block, the stack briefly reveals the
    // BlockStatement itself again before the next child is pushed; same
    // for Program between top-level statements). Their `loc` points at the
    // block's opening line (often the same line as the enclosing
    // if/for/while) or, for Program, permanently at line 1 — so surfacing
    // them as real steps makes the highlighted line jump backward after
    // almost every statement. They carry no executable content of their
    // own, so we always skip past them rather than deduping by line.
    const CONTAINER_TYPES = new Set(["BlockStatement", "Program"]);

    while (alive) {
      if (stepCount > maxSteps * 50) {
        // Hard guard against runaway sub-step loops
        truncated = true;
        break;
      }
      stepCount++;

      try {
        alive = interpInstance.step();
      } catch (e) {
        const err = e as { message?: string };
        const last = events[events.length - 1];
        events.push({
          step: events.length,
          line: lastLine,
          event: "exception",
          stack: last?.stack ?? [],
          heap: last?.heap ?? {},
          stdout: stdoutBuf.slice(stdoutEmitted),
          error: { message: err.message ?? "Runtime error", line: lastLine },
        });
        stdoutEmitted = stdoutBuf.length;
        return { events, truncated, diagnostics: [] };
      }

      const stack = interpInstance.getStateStack();
      if (stack.length === 0) break;
      const top = stack[stack.length - 1];
      if (!top.node) continue;
      if (CONTAINER_TYPES.has(top.node.type)) continue;
      if (
        (top.node.type === "IfStatement" || top.node.type === "ConditionalExpression") &&
        top.mode_ === 2
      ) {
        // Closing revisit: the test and the taken branch already ran: this
        // state is only back on top of the stack to be popped. Surfacing
        // it would flash the `if` line again right after its block
        // finishes, with no locals changed — skip straight to whatever
        // comes next.
        continue;
      }

      const line = top.node.loc?.start?.line ?? lastLine;
      const depth = uniqueScopes(stack).length;
      const isStatement = STATEMENT_TYPES.has(top.node.type);

      if (!isStatement && line === lastLine && depth === lastDepth) continue;
      if (line === lastLine && depth === lastDepth) continue;

      const heap: Record<string, HeapObject> = {};
      const frames = buildFrames(stack, reflector.reflect, heap);

      const stdoutDelta = stdoutBuf.slice(stdoutEmitted);
      stdoutEmitted = stdoutBuf.length;

      const eventKind: TraceEventKind =
        lastDepth === -1
          ? "step"
          : depth > lastDepth
            ? "call"
            : depth < lastDepth
              ? "return"
              : "step";

      events.push({
        step: events.length,
        line,
        event: eventKind,
        stack: frames,
        heap,
        stdout: stdoutDelta,
      });

      lastLine = line;
      lastDepth = depth;

      if (events.length >= maxSteps) {
        truncated = true;
        break;
      }
    }

    return { events, truncated, diagnostics: [] };
  },
};
