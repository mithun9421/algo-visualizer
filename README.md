# Algorithm Visualizer

In-browser step-by-step visualizer for Python and JavaScript algorithms. No AI — real interpreters trace your code and render every variable, array, call frame, and data structure as it changes.

See [PRD.md](./PRD.md) for the full requirements and phased plan.

## Status

Phase 1 — scaffolding. MVP target: JS code → end-to-end visualization (Phase 4).

## Quick start

```bash
pnpm install
pnpm dev
```

Open http://localhost:3000.

## Stack

Next.js 15 · React 19 · TypeScript · Tailwind v4 · CodeMirror 6 · js-interpreter · Framer Motion · dagre · cytoscape · zustand
