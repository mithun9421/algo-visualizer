import { describe, expect, it } from "vitest";
import { buildRecursionTree, statusAtStep } from "./recursionTree";
import type { Frame, TraceEvent, TraceEventKind, Value } from "./types";

function frame(fnName: string, line: number, locals: Record<string, Value> = {}): Frame {
  return { fnName, line, locals };
}

function evt(step: number, event: TraceEventKind, stack: Frame[]): TraceEvent {
  return { step, line: stack[stack.length - 1]?.line ?? 1, event, stack, heap: {}, stdout: "" };
}

const GLOBAL = frame("global", 1);

/**
 * Synthetic trace shaped like naive fib(4):
 *
 *              fib(4)
 *             /      \
 *         fib(3)     fib(2)b   <- sibling fib(2), same fnName as fib(2)a
 *        /      \
 *    fib(2)a   fib(1)
 *
 * 5 call instances total, two of them share fnName "fib" as direct
 * siblings under different parents — the case a naive fnName-keyed
 * approach would conflate.
 */
const FIB_EVENTS: TraceEvent[] = [
  evt(0, "step", [GLOBAL]),
  evt(1, "call", [GLOBAL, frame("fib", 2, { n: 4 })]),
  evt(2, "call", [GLOBAL, frame("fib", 2, { n: 4 }), frame("fib", 2, { n: 3 })]),
  evt(3, "call", [
    GLOBAL,
    frame("fib", 2, { n: 4 }),
    frame("fib", 2, { n: 3 }),
    frame("fib", 2, { n: 2 }),
  ]),
  evt(4, "return", [GLOBAL, frame("fib", 2, { n: 4 }), frame("fib", 2, { n: 3 })]),
  evt(5, "call", [
    GLOBAL,
    frame("fib", 2, { n: 4 }),
    frame("fib", 2, { n: 3 }),
    frame("fib", 2, { n: 1 }),
  ]),
  evt(6, "return", [GLOBAL, frame("fib", 2, { n: 4 }), frame("fib", 2, { n: 3 })]),
  evt(7, "return", [GLOBAL, frame("fib", 2, { n: 4 })]),
  evt(8, "call", [GLOBAL, frame("fib", 2, { n: 4 }), frame("fib", 2, { n: 2 })]),
  evt(9, "return", [GLOBAL, frame("fib", 2, { n: 4 })]),
  evt(10, "return", [GLOBAL]),
];

describe("buildRecursionTree", () => {
  it("builds correct nodes and edges for branching recursion", () => {
    const tree = buildRecursionTree(FIB_EVENTS);

    expect(tree.nodes).toHaveLength(5);
    expect(tree.edges).toHaveLength(4);

    const root = tree.nodes.find((n) => n.parentId === null);
    expect(root).toBeDefined();
    expect(root?.fnName).toBe("fib");
    expect(root?.args).toEqual({ n: 4 });
    expect(root?.callStep).toBe(1);
    expect(root?.returnStep).toBe(10);

    const children = tree.nodes.filter((n) => n.parentId === root?.id);
    expect(children).toHaveLength(2);
    expect(children.map((c) => c.args.n).sort()).toEqual([2, 3]);

    const fib3 = children.find((c) => c.args.n === 3)!;
    const grandchildren = tree.nodes.filter((n) => n.parentId === fib3.id);
    expect(grandchildren).toHaveLength(2);
    expect(grandchildren.map((c) => c.args.n).sort()).toEqual([1, 2]);

    // The two fib(2) calls (one under fib(3), one under fib(4)) are
    // distinct node instances despite sharing fnName + args.
    const fib2Nodes = tree.nodes.filter((n) => n.fnName === "fib" && n.args.n === 2);
    expect(fib2Nodes).toHaveLength(2);
    expect(fib2Nodes[0].id).not.toBe(fib2Nodes[1].id);
    expect(new Set(fib2Nodes.map((n) => n.parentId)).size).toBe(2);

    const fib2a = fib2Nodes.find((n) => n.parentId === fib3.id)!;
    expect(fib2a.callStep).toBe(3);
    expect(fib2a.returnStep).toBe(4);

    const fib2b = fib2Nodes.find((n) => n.parentId === root?.id)!;
    expect(fib2b.callStep).toBe(8);
    expect(fib2b.returnStep).toBe(9);
  });

  it("returns an empty tree for a trace with no function calls", () => {
    const flat: TraceEvent[] = [evt(0, "step", [GLOBAL]), evt(1, "step", [GLOBAL])];
    const tree = buildRecursionTree(flat);
    expect(tree.nodes).toHaveLength(0);
    expect(tree.edges).toHaveLength(0);
  });

  it("leaves an open call's returnStep null when the trace is truncated mid-call", () => {
    const truncated: TraceEvent[] = [
      evt(0, "step", [GLOBAL]),
      evt(1, "call", [GLOBAL, frame("fib", 2, { n: 4 })]),
      evt(2, "call", [GLOBAL, frame("fib", 2, { n: 4 }), frame("fib", 2, { n: 3 })]),
    ];
    const tree = buildRecursionTree(truncated);
    expect(tree.nodes).toHaveLength(2);
    const outer = tree.nodes.find((n) => n.args.n === 4)!;
    const inner = tree.nodes.find((n) => n.args.n === 3)!;
    expect(outer.returnStep).toBeNull();
    expect(inner.returnStep).toBeNull();
    expect(inner.parentId).toBe(outer.id);
  });
});

describe("statusAtStep", () => {
  const tree = buildRecursionTree(FIB_EVENTS);
  const nodeFor = (n: number, parentArg?: number) =>
    tree.nodes.find(
      (node) =>
        node.args.n === n &&
        (parentArg === undefined ||
          tree.nodes.find((p) => p.id === node.parentId)?.args.n === parentArg)
    )!;

  it("classifies pending calls not yet reached", () => {
    const status = statusAtStep(tree, 0);
    const root = nodeFor(4);
    expect(status.get(root.id)).toBe("pending");
  });

  it("classifies a call as active while it is on the stack", () => {
    const status = statusAtStep(tree, 3);
    const root = nodeFor(4);
    const fib3 = nodeFor(3);
    const fib2a = nodeFor(2, 3);
    expect(status.get(root.id)).toBe("active");
    expect(status.get(fib3.id)).toBe("active");
    expect(status.get(fib2a.id)).toBe("active");
  });

  it("classifies a call as done once it has returned", () => {
    const status = statusAtStep(tree, 5);
    const fib2a = nodeFor(2, 3);
    const fib2b = nodeFor(2, 4);
    expect(status.get(fib2a.id)).toBe("done");
    expect(status.get(fib2b.id)).toBe("pending");
  });
});
