# Algorithm Visualizer — Product Requirements Document

**Owner:** Mithun
**Status:** Pre-implementation (scaffolding next)
**Last updated:** 2026-05-11
**Location:** `/Users/mrbad/vibeprojects/algo-visualizer/`

> This is the source-of-truth document. If a session is interrupted, re-read this file end-to-end before continuing. Update the **Progress Log** at the bottom after every meaningful change.

---

## 1. Problem & Goal

Developers learning algorithms struggle to mentally simulate variable state, recursion, and data-structure mutations from reading code alone. Existing tools (Python Tutor, Algorithm Visualizer, VisuAlgo) each solve part of the problem but none combine: multi-language input, deep auto-detected data-structure rendering (linked lists, trees, graphs), and a fully client-side experience with shareable URLs.

**Goal:** A web app where the user pastes Python or JavaScript code, presses play, and watches it execute step by step — with full controls (forward, back, play/pause, speed, breakpoints) and rich visualization of every piece of state.

**Non-goal:** Running production code, AI-driven explanation, real-language full conformance, or replacing a debugger.

## 2. Principles

- **Deterministic, not AI.** All stepping comes from real interpreters/parsers we control. No LLM in the execution path.
- **Client-only.** The entire app runs in the browser. No server-side code execution. Share URLs are just hash-encoded traces.
- **Pluggable languages.** Adding a new language must not touch the UI layer. Languages plug in via a single `LanguageAdapter` interface.
- **Time-travel first.** Traces are materialized fully upfront so backward stepping is free.
- **Subset over completeness.** We support a defined subset of each language. Anything outside the subset is a parser error with a clear message — never a silent miscompile.

## 3. Supported Language Subsets

### Python (subset, MVP+1)
**Included:**
- Variables, assignment, augmented assignment (`+=`, `-=`, etc.)
- All arithmetic, comparison, logical, bitwise operators
- `if` / `elif` / `else`
- `for` (with `range`) and `while` loops, `break`, `continue`
- Lists, dicts, tuples — literals, indexing, slicing, mutation
- Functions (`def`), positional + default args, return, recursion
- Builtins: `len`, `range`, `print`, `min`, `max`, `sum`, `abs`, `sorted`, `reversed`, `int`, `str`, `float`, `bool`, `list`, `dict`, `tuple`

**Explicitly excluded** (parser rejects with helpful error):
- `class` / OOP
- `import` / modules
- Generators (`yield`)
- List/dict comprehensions
- `try` / `except`
- f-strings
- `lambda`, decorators
- `with`, context managers
- `async` / `await`
- Multiple assignment unpacking beyond the simplest case (`a, b = b, a` is fine; nested patterns are not)

### JavaScript (subset, MVP)
Defined by what `js-interpreter` 5.2.1 natively supports — **ES5 only** in practice (despite the README's ES6 hints, `let`/`const` are rejected by the parser; verified 2026-05-11). Samples ship with `var`.
**Included:**
- `var` (no `let`/`const`)
- All arithmetic, comparison, logical, bitwise operators
- `if` / `else`, ternary
- `for`, `for...in`, `for...of`, `while`, `do...while`, `break`, `continue`
- Arrays, objects — literals, indexing, mutation
- Functions (declarations + expressions + arrow), recursion, closures
- `console.log` (only the `log` method; other levels collapse to log)

**Explicitly excluded:**
- `async` / `await`, Promises
- Generators (`function*`, `yield`)
- ES6 classes (deferred — may add in v1.1 since js-interpreter has partial support)
- Modules (`import`/`export`)
- DOM, `fetch`, timers, any browser/node API
- `try` / `catch` (deferred)
- Template literals (deferred; `js-interpreter` support varies)

### Java (deferred — long-term)
Planned subset mirrors Python: primitive vars, `if`/`else`, `for`/`while`, arrays, methods, recursion, `System.out.println`, basic `String`. No classes-as-feature beyond a single `public static void main` shell. Implementation path: `java-parser` (Chevrotain-based, ~300KB) + custom tree-walking interpreter, registered as another `LanguageAdapter`.

## 4. Functional Requirements

### 4.1 Editor
- Monospace code editor with syntax highlighting for Python and JS
- Language selector dropdown
- Breakpoint gutter — click line number to toggle a breakpoint
- Current-line highlight (driven by the player)
- Read-only mode while playing; editable when paused or stopped
- Default sample programs per language (bubble sort, binary search, BFS, recursion, linked list reverse)

### 4.2 Controls
- Play, Pause
- Step Forward (one statement)
- Step Backward (one statement)
- Reset to step 0
- Seek to end
- Speed slider — discrete steps: 0.25×, 0.5×, 1×, 2×, 4× (steps per second)
- Breakpoint toggle (also via clicking gutter)
- Step counter ("Step 14 / 87")
- "Truncated at maxSteps" banner if trace exceeded the cap

### 4.3 Visualization
- **Call Stack:** stacked cards, newest on top, each card shows function name + line + local variables
- **Scope/Variables:** scalars in a 2-col table (name → value), with a `data-changed` flash on the cell that changed this step
- **Arrays/Lists:** flex row of cells with index pointers (`i`, `j`, `lo`, `hi`) rendered as colored chips below the cell they point to. Color is hashed from variable name for stability.
- **Heap objects:** rendered in a separate canvas region, with SVG arrows from frame variables that hold references
- **Auto-detected shapes** (heuristic-based, see §5):
  - Linked list → horizontal boxes with arrows
  - Binary tree → top-down dagre layout
  - Graph → cytoscape with fcose layout
  - Generic object/dict → key/value table (fallback)
- **Per-object override:** small dropdown lets the user force `auto / object / list / tree / graph` rendering
- **Console output:** monospace panel below visualization, accumulates `print` / `console.log` output

### 4.4 Sharing
- "Share" button generates a URL: `/share#<gzipped-base64-of-{lang,source,maxSteps}>`
- The receiving page re-runs the interpreter (we never serialize the trace itself — too large) and lands on step 0
- No backend, no database, no API route (deferred to long-term)

### 4.5 Error Handling
- Parse errors: red squiggle under the offending line, error panel with `line:col message`
- Runtime errors (e.g. divide-by-zero, undefined variable): trace plays up to the error step, then shows an error card overlay
- Step limit hit: yellow banner "Execution truncated at 10,000 steps"

## 5. Architecture

### 5.1 Directory layout

```
vibeprojects/algo-visualizer/
├── PRD.md                                # this file
├── app/                                  # Next.js App Router shell
│   ├── layout.tsx
│   ├── page.tsx                          # main editor + visualizer
│   ├── share/page.tsx                    # shared trace re-run
│   └── globals.css
├── src/
│   ├── trace/                            # core data model — zero deps
│   │   ├── types.ts                      # TraceEvent, Frame, HeapObject, Ref
│   │   ├── builder.ts                    # TraceBuilder helper for adapters
│   │   ├── diff.ts                       # delta(prev, next) → highlights
│   │   └── serialize.ts                  # encode/decode for share URLs
│   ├── adapters/                         # language plug-ins
│   │   ├── registry.ts
│   │   ├── types.ts                      # LanguageAdapter interface
│   │   ├── javascript/                   # MVP — wraps js-interpreter
│   │   │   ├── index.ts
│   │   │   ├── instrument.ts
│   │   │   └── reflect.ts
│   │   ├── python/                       # Phase 7 — custom interpreter
│   │   │   ├── index.ts
│   │   │   ├── lexer.ts
│   │   │   ├── parser.ts
│   │   │   ├── interpreter.ts
│   │   │   └── builtins.ts
│   │   └── java/                         # Long-term — stub only at MVP
│   ├── inference/                        # heap-shape classifier
│   │   ├── index.ts
│   │   ├── linkedList.ts
│   │   ├── tree.ts
│   │   └── graph.ts
│   ├── player/                           # state machine
│   │   ├── store.ts                      # zustand store wrapping reducer
│   │   ├── reducer.ts                    # pure reducer
│   │   ├── usePlayer.ts                  # React hook
│   │   └── breakpoints.ts
│   ├── renderer/                         # view layer
│   │   ├── Visualizer.tsx
│   │   ├── CodePane.tsx
│   │   ├── CallStack.tsx
│   │   ├── Scope.tsx
│   │   ├── Heap.tsx                      # dispatches by inferred shape
│   │   ├── shapes/
│   │   │   ├── LinkedListView.tsx
│   │   │   ├── TreeView.tsx
│   │   │   ├── GraphView.tsx
│   │   │   └── ObjectView.tsx
│   │   ├── Console.tsx
│   │   └── Controls.tsx
│   ├── samples/                          # default programs per language
│   │   ├── javascript.ts
│   │   └── python.ts
│   └── lib/                              # misc utils (id gen, hash colors)
├── tests/
└── package.json
```

### 5.2 The Trace contract

```ts
type Ref = { kind: 'ref'; id: string };
type Primitive = string | number | boolean | null | undefined;
type Value = Primitive | Ref;

interface Frame {
  fnName: string;
  line: number;
  locals: Record<string, Value>;
}

interface HeapObject {
  id: string;
  type: 'array' | 'dict' | 'object' | 'instance';
  className?: string;
  fields: Record<string, Value>;
  hint?: 'linkedList' | 'tree' | 'graph';   // adapter-supplied tag (optional)
}

interface TraceEvent {
  step: number;
  line: number;
  event: 'step' | 'call' | 'return' | 'exception';
  stack: Frame[];                            // top = current frame
  heap: Record<string, HeapObject>;          // full snapshot per step
  stdout: string;                            // delta this step only
  error?: { message: string; line: number };
}

interface TraceResult {
  events: TraceEvent[];
  truncated: boolean;
  diagnostics: { line: number; col: number; message: string; severity: 'error' | 'warn' }[];
}
```

### 5.3 Language Adapter

```ts
interface LanguageAdapter {
  id: 'python' | 'javascript' | 'java';
  displayName: string;
  fileExtension: string;
  defaultSample: string;
  trace(source: string, opts?: { maxSteps?: number }): Promise<TraceResult>;
}
```

Each adapter wraps its interpreter and emits `TraceEvent`s via `TraceBuilder`. UI imports only `registry.getAdapter(langId)`.

### 5.4 Player state machine

```ts
type PlayerState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'paused';   index: number; trace: TraceEvent[] }
  | { kind: 'playing';  index: number; trace: TraceEvent[]; speed: number }
  | { kind: 'finished'; trace: TraceEvent[] }
  | { kind: 'error';    message: string };

type PlayerAction =
  | { type: 'load'; events: TraceEvent[] }
  | { type: 'play' } | { type: 'pause' }
  | { type: 'stepFwd' } | { type: 'stepBack' }
  | { type: 'seek'; index: number }
  | { type: 'setSpeed'; speed: number }
  | { type: 'toggleBreakpoint'; line: number };

function reducer(s: PlayerState, a: PlayerAction): PlayerState; // pure
```

`usePlayer` wraps the reducer + `requestAnimationFrame` advancement, honoring breakpoints. Renderer subscribes to `{ trace[index], prevIndex }` only.

### 5.5 Rendering pipeline

`Visualizer` reads current `TraceEvent` and fans out:
- `CodePane`  ← `event.line`, breakpoints
- `CallStack` ← `event.stack`
- `Scope`     ← `event.stack[top].locals` (resolves `Ref` via `event.heap`)
- `Heap`      ← runs `inference/*` on each `HeapObject` (unless `.hint` set) → dispatches to `LinkedListView` / `TreeView` / `GraphView` / `ObjectView`
- `Console`   ← accumulates `stdout` up to current step (memoized prefix sum)

### 5.6 Inference heuristics

Classifier walks the heap graph each step:
- **Linked list:** object has exactly one self-typed ref field (`next`/`prev`/`child`), chain length ≥ 2, no cycle back to head
- **Binary tree:** object has `left`/`right` (or two self-typed refs), acyclic
- **Graph:** object with `adj`/`neighbors` array of self-typed refs, OR cycles detected
- **Generic:** fallback

Classification is cached per object id (`hint` or first-classification) so a list doesn't redraw as a tree mid-execution.

## 6. Tech Stack

| Layer | Library | Reason |
|---|---|---|
| Framework | Next.js 15 (App Router) + TypeScript | User's stack |
| Styling | Tailwind CSS | User's stack |
| JS interpreter | `js-interpreter` (~25KB, Apache-2.0) | Built-in `step()` + `getStateStack()` |
| Python interpreter | Custom subset (no npm dep, ~50KB hand-rolled) | Skulpt is 1MB+; for the defined subset, owning it is cheaper |
| Editor | `@uiw/react-codemirror` + `@codemirror/lang-python` + `@codemirror/lang-javascript` | ~150KB total, gutter API, line decorations |
| Animations | `framer-motion` (`layoutId`) | Auto-tween node positions across steps |
| Trees | `@dagrejs/dagre` + SVG | Lightweight deterministic layout |
| Graphs | `cytoscape` + `cytoscape-fcose` | Animated graph layouts |
| Layout | `react-resizable-panels` | 4-zone resizable splits |
| State | `zustand` | Holds player reducer state |
| Utils | `clsx`, `tailwind-merge`, `nanoid`, `pako` (gzip for share URLs) | — |

**Bundle target:** under 1MB gzipped initial load.

**shadcn/ui policy:** Approved for use when a component need is non-trivial — Select with search, Tooltip, Dialog, Toast, Popover, Combobox. Do **not** install for plain buttons or basic inputs (the Tailwind cost is lower than the shadcn copy-paste overhead). First introduction will be in Phase 4 or 5 when we need the "render-as" override Select on heap objects.

## 7. Phased Delivery Plan

> Each phase has explicit acceptance criteria. Don't move on until they're met.

### Phase 1 — Scaffolding (MVP setup) ✅
**Goal:** Empty Next.js project with the directory structure in place and dependencies installed.

- [x] Hand-rolled Next.js 15 + React 19 + TS + Tailwind v4 scaffold (avoided `create-next-app` since PRD.md already existed in the dir)
- [x] Install all deps from §6 (`pnpm install` — clean)
- [x] Directory tree from §5.1 created with placeholder files
- [x] `src/trace/types.ts` written per §5.2 — the contract
- [x] `src/adapters/types.ts` + `registry.ts` written per §5.3
- [x] `src/player/reducer.ts` written per §5.4 (pure, no React, handles all `PlayerAction`s)
- [x] `src/lib/cn.ts` (clsx + tailwind-merge helper)
- [x] `vercel.json` + `README.md` + `.gitignore` + `.eslintrc.json`
- [x] `pnpm dev` boots successfully (port 3001 since 3000 is taken, ready in ~1.4s)
- [x] `pnpm typecheck` passes clean

**Acceptance:** ✅ Met. `pnpm dev` runs. `pnpm typecheck` passes. Directory tree matches §5.1.

### Phase 2 — Mock trace + 4-pane layout ✅
**Goal:** UI shell wired to a hardcoded `TraceEvent[]`, so all UI work can proceed before interpreters exist.

- [x] `src/samples/mockTrace.ts` — sum loop, 10 steps with call frame transitions
- [x] zustand `usePlayerStore` wrapping the pure reducer
- [x] 4-zone layout via `react-resizable-panels` — code left, stack+scope top-right, heap middle-right, console bottom; all splits resizable
- [x] `Controls.tsx` — back / play-pause / step / reset / speed select / seek slider / step counter, all wired
- [x] `Visualizer.tsx` auto-loads `MOCK_TRACE` on mount
- [x] `CodePane`, `CallStack`, `Heap`, `Console` placeholder views read from store
- [x] Click line gutter → toggle breakpoint (real reducer action; visual will get richer in Phase 3 with CodeMirror)
- [x] Dark theme (Tailwind v4 + `globals.css`)
- [x] `pnpm typecheck` clean; `pnpm dev` boots; page returns 200 with all panes rendered

**Acceptance:** ✅ Met. App boots, mock trace renders, all controls drive the step counter, layout is resizable.

### Phase 3 — CodeMirror editor + player ✅
**Goal:** Real editor with breakpoint gutter and current-line highlight, fully functional player.

- [x] `CodePane.tsx` — CodeMirror 6 via `@uiw/react-codemirror`, JS + Python language modes, dark theme tuned to match app
- [x] Custom breakpoint gutter (`gutter()` + `GutterMarker` red ●) — click toggles via store
- [x] `breakpointsField` + `currentLineField` StateFields, updated from React via `StateEffect`s
- [x] `Decoration.line()` for current execution line (emerald background + 2px left border)
- [x] Read-only `Compartment` toggled by `isPlaying`
- [x] `usePlayer` hook with `requestAnimationFrame` auto-advance — reads fresh state via `getState()` so speed changes apply mid-play without recreating the loop
- [x] Breakpoint hit → step then pause (look-ahead at `state.trace[index+1].line`)
- [x] Step counter already present in `Controls.tsx` ("N / total")
- [x] `pnpm typecheck` clean; dev server boots; HTTP 200

**Acceptance:** ✅ Met. Editor loads with the mock source, current line highlights as you step, gutter clicks toggle red breakpoints, Play auto-advances at the selected speed, hitting a breakpoint pauses, editor goes read-only while playing.

### Phase 4 — JavaScript adapter (END OF MVP) ✅
**Goal:** Real JS code → real trace → visualization works end-to-end.

- [x] `src/adapters/javascript/index.ts` — wraps `js-interpreter` 5.2.1 (lazy dynamic import; CJS via Webpack UMD)
- [x] Per-step loop: emits on (line OR scope-depth) change; sub-statement nodes filtered out (~11× compression — 34 events for a 3-element bubble sort vs 374 raw `.step()` calls, verified)
- [x] `Frame[]` built from unique scopes in the state stack; function name resolved via `state.func_.node.id.name`
- [x] `Value` reflection: primitives passed through; pseudo-objects assigned stable ids via per-trace `Map<obj, id>`; cycles broken by inserting heap placeholder before walking fields
- [x] Array vs object detected via `pseudoObj.class === "Array"`
- [x] `console.log` captured via `createNativeFunction`; delta per step
- [x] Error handling: try/catch on construction (parse) and step (runtime); diagnostics + error banner in Visualizer
- [x] **Scope.tsx** — scalars table + inline arrays with **index pointer chips** (colored by hashed variable name) + flash-on-change via `av-flash` keyframe in `globals.css`; ref-to-object inlines an `ObjectInline` view
- [x] **CallStack.tsx** — stacked frame cards, innermost on top, top frame highlighted emerald, each card embeds `Scope`
- [x] **ObjectView.tsx** + **Heap.tsx** — generic key/value + array rendering for every heap object
- [x] **Visualizer.tsx** — manages source state, sample picker (4 samples), Run button, async trace, error banner, truncation banner
- [x] CodePane converted to controlled component (`value` + `onChange`)
- [x] `pnpm typecheck` clean; dev boots; HTTP 200

**Acceptance:** ✅ Code compiles and serves end-to-end. Adapter probe (Node-side) verifies correct event stream for bubble sort. Interactive browser verification of all 4 samples is the user's next step.

**👉 This is the MVP. Everything below is post-MVP.**

---

### Phase 5 — Heap inference + specialized shape views ✅
- [x] `inference/linkedList.ts` — single self-typed ref chain, cycle = reject
- [x] `inference/tree.ts` — `left`/`right` BFS, cycle = reject
- [x] `inference/graph.ts` — fires on `adj`/`neighbors`/`edges` array OR cycles
- [x] `inference/index.ts` — orchestrates: hints → user overrides → linked-list → tree → graph → object fallback; incoming-ref map identifies roots
- [x] `LinkedListView.tsx` — flex row of boxes + `→` arrows, `→ null` terminator
- [x] `TreeView.tsx` — dagre TB layout, SVG nodes + edges with field labels (`l`/`r`)
- [x] `GraphView.tsx` — cytoscape with cytoscape-fcose, dark theme, lazy-loaded (`await import`)
- [x] Per-shape **render-as override** dropdown (auto / object / list / tree / graph)
- [x] New JS sample: Binary Tree inorder traversal
- [x] Inference probe validates linked-list + tree classification on a hand-built heap

**Acceptance:** ✅ Met. Linked List Reverse sample → boxes + arrows. Binary Tree sample → top-down dagre layout with labeled edges. Override dropdown re-classifies any structure on demand. Standalone arrays/dicts fall through to `ObjectView`.

### Phase 6 — Framer Motion polish
- [ ] Add `layoutId={heapObject.id}` to every heap-node component
- [ ] Animated transitions on array swap, list insert, tree rotation
- [ ] CSS-only flash (`animate-flash`) for primitive value changes
- [ ] Smooth seek animation when scrubbing the timeline

**Acceptance:** Stepping through a swap visibly animates the two cells exchanging positions.

### Phase 7 — Python adapter
- [ ] `src/adapters/python/lexer.ts` — tokenizer for the §3 subset (indentation-aware)
- [ ] `src/adapters/python/parser.ts` — recursive-descent / Pratt parser → AST
- [ ] `src/adapters/python/interpreter.ts` — tree-walker, emits `TraceEvent` per statement
- [ ] `src/adapters/python/builtins.ts` — `len`, `range`, `print`, `min`, `max`, `sum`, `abs`, `sorted`, `reversed`, type coercions
- [ ] Parse-error messages cite line + column
- [ ] Out-of-subset syntax (classes, imports, comprehensions, etc.) produces a clear `"<feature> is not supported in this visualizer"` error
- [ ] Default Python samples: bubble sort, binary search, factorial, linked-list reverse (matching JS samples for cross-language comparison)

**Acceptance:** All 4 Python samples run end-to-end with correct trace. Out-of-subset code rejected with helpful message.

### Phase 8 — Share URLs
- [ ] `src/trace/serialize.ts` — gzip+base64 of `{ lang, source, maxSteps }` (NOT the trace; re-run on the receiving side)
- [ ] "Share" button in toolbar writes URL hash
- [ ] `app/share/page.tsx` reads hash, decodes, re-runs through adapter
- [ ] Copy-to-clipboard confirmation toast

**Acceptance:** Share button copies a URL. Opening that URL in a new tab loads the same code and stops at step 0.

### Phase 9 — Java placeholder
- [ ] `src/adapters/java/index.ts` — adapter stub registered in `registry.ts`
- [ ] `trace()` throws `"Java support is coming soon"`
- [ ] Java appears greyed out in language dropdown with tooltip

**Acceptance:** Selecting Java shows "Coming soon" UI; does not crash.

---

## 8. Long-term Roadmap (post-v1)

These are explicitly **not** in scope for the initial release. Listed so they're not forgotten.

- **Java real support** — `java-parser` + tree-walker matching the Python pattern; subset per §3
- **More Python features** — classes, comprehensions, `try/except`, f-strings (each is a sub-phase)
- **More JS features** — ES6 classes, `try/catch`, template literals
- **Save & embed** — paste a public URL into a Markdown doc and it embeds an iframe player
- **Custom data-structure annotations** — `// @viz tree(left, right)` comment-based hints
- **Diff view** — split-screen comparing two algorithm runs (e.g. naive vs optimized)
- **Algorithm gallery** — curated catalog (sorting, searching, DP, graph) loadable in one click
- **Tutorial mode** — guided narration overlay (still no AI — pre-written per algorithm)
- **Mobile-friendly layout** — currently desktop-first
- **Step trace export** — download trace as JSON for offline analysis
- **Performance profiling** — show ops counter per line (rough complexity visualization)
- **Tests** — Vitest unit tests for adapters + reducer; Playwright e2e for the player

## 9. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| `js-interpreter` is slow on big traces | Cap at `maxSteps: 10000`; show truncation banner |
| Custom Python interpreter is buggy at edges | Ship JS first (MVP); Python is Phase 7; lock subset narrowly |
| Bundle size balloons | Lazy-load `cytoscape` and `dagre` only when graph/tree shapes detected |
| Heap snapshot memory grows unbounded | Cap steps; structural-sharing optimization only if it becomes a real problem |
| Auto-detection misclassifies (e.g. a linked list looks like a tree) | Per-object override dropdown; cache first classification per id |
| Share URLs get too long | Encode `{ lang, source }` not the trace; re-run on receiver side |

## 10. Out of Scope (explicit)

- Server-side execution
- AI-generated explanations
- Multi-user collaboration / real-time
- User accounts, login, persistence
- Sandboxing untrusted code beyond what the in-browser interpreters already provide
- Performance benchmarking of algorithms
- Code completion / IntelliSense in the editor

## 11. Acceptance for v1 Release

To call v1 "done":
- [ ] Phases 1–8 complete with their acceptance criteria
- [ ] Phase 9 stub in place
- [ ] All 4 default samples work in both JS and Python end-to-end
- [ ] Share URL works
- [ ] No console errors on the happy path
- [ ] Lighthouse performance score ≥ 80
- [ ] Initial JS bundle ≤ 1MB gzipped
- [ ] README with screenshots and usage examples
- [ ] Deployed to Vercel (`vercel.json` ready in Phase 1)

---

## 12. Progress Log

> Append a dated bullet after every meaningful commit. Most recent on top.

- **2026-05-11** — Bug fix: Play button only advanced one step. Root cause: `stepFwd`/`seek`/`stepBack` actions in the reducer were force-resetting `kind: "paused"`, so the play loop's first `stepFwd` dispatch killed itself. Fixed: those actions now preserve current kind (`playing` stays `playing`); only `pause`/`reset` explicitly transition kinds. Recalibrated speed formula (`200/speed` instead of `1000/speed`) so 1× = 5 steps/sec. Manual Step button now dispatches `pause` before `stepFwd` to match intent. Reducer probe simulates 10 ticks under `playing` and confirms `playing → finished` transition only at end. Also: auto-rerun on edit (400ms debounce) + amber stale Run-button indicator.
- **2026-05-11** — Phase 5 complete. Heap shape inference: linked list, binary tree, graph detectors + orchestrator that builds an incoming-ref map and classifies roots in priority order (hints → overrides → list → tree → graph → object). Three shape views: `LinkedListView` (flex+arrows), `TreeView` (dagre+SVG), `GraphView` (cytoscape+fcose, lazy-loaded). Per-shape "render as" dropdown. New JS sample: Binary Tree inorder. Inference probe verified linked-list + tree classification on hand-built heap.
- **2026-05-11** — **Phase 4 complete — MVP shipped.** JavaScript adapter wraps `js-interpreter` 5.2.1 via lazy dynamic import, emits ~one event per executed line (line/depth-change gate). Value reflection produces stable heap ids and refs; cycles handled. UI: sample picker, Run button, controlled CodeMirror, rich Scope with array cells + colored index-pointer chips + flash-on-change, stacked frame cards with innermost-on-top, generic Heap view, error banner, truncation banner. Constraint discovered: `js-interpreter` is ES5-only (no `let`/`const`); PRD §3 updated; samples use `var`. Node-side probe validates the event stream (34 events / 374 raw steps for bubble sort, swaps visible).
- **2026-05-11** — Phase 3 complete. CodeMirror 6 integrated with custom breakpoint gutter (clickable, red ●), current-line `Decoration.line()` driven by `StateEffect`s mirrored from zustand, read-only `Compartment` toggled while playing. `usePlayer` hook drives auto-advance via rAF and pauses on breakpoints by look-ahead. **Client-only constraint reinforced** — no external compile APIs anywhere (memory saved). Next: Phase 4 = real JS adapter via `js-interpreter` → MVP.
- **2026-05-11** — Phase 2 complete. zustand store, mock 10-step trace, 4-pane resizable layout, full Controls (back/play/step/reset/speed/seek), and read-only mock CodePane (with clickable breakpoint gutter) all working. Heap and Console panes wire to store. shadcn deferred to Phase 4/5 per new policy in §6. Ready for Phase 3 (CodeMirror 6 + real player auto-advance).
- **2026-05-11** — Phase 1 complete. Next.js 15 + React 19 + TS + Tailwind v4 scaffold up. All deps installed. Trace contract, adapter interface, registry, and player reducer written. `pnpm dev` and `pnpm typecheck` both green. Ready for Phase 2 (mock trace + 4-pane layout).
- **2026-05-11** — PRD drafted. Tech stack, architecture, and phased plan locked. Ready to start Phase 1.

---

## 13. How to Resume Work in a Fresh Session

If you (Claude) are loaded with no context and the user asks to resume:

1. Read this entire file.
2. Check the Progress Log (§12) for the most recent state.
3. Run `git status` and `git log --oneline -20` inside `vibeprojects/algo-visualizer/` to confirm.
4. Identify the current phase from §7. The first incomplete checkbox is your next task.
5. Confirm the next step with the user in one short sentence before writing code.
6. After completing meaningful work, update the Progress Log and tick checkboxes in §7.
