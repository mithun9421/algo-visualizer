import type { TraceEvent, Value } from "./types";

export interface RecursionNode {
  id: string;
  fnName: string;
  parentId: string | null;
  callStep: number;
  callLine: number;
  returnStep: number | null;
  args: Record<string, Value>;
  order: number;
}

export interface RecursionTree {
  nodes: RecursionNode[];
  edges: { from: string; to: string }[];
}

/**
 * Derives the full recursion call tree from a materialized trace.
 *
 * `Frame` carries no call-instance id, so sibling calls to the same
 * function (e.g. two separate `fib(2)` invocations under different
 * parents) can't be told apart by name alone. Instead this walks the
 * trace once, tracking a stack of synthesized node ids kept in sync with
 * `event.stack.length` (excluding index 0, the adapters' shared implicit
 * "global" root frame, which never becomes a node of its own). Depth
 * deltas — not the `event` kind — drive call/pop detection, so this
 * works identically for any adapter conforming to the shared trace
 * contract.
 */
export function buildRecursionTree(events: TraceEvent[]): RecursionTree {
  const nodeById = new Map<string, RecursionNode>();
  const insertionOrder: string[] = [];
  const edges: { from: string; to: string }[] = [];
  const callIdStack: string[] = [];
  let order = 0;

  for (const event of events) {
    // stack[0] is always the implicit "global" root — exclude it from
    // the target depth so it never becomes a RecursionNode.
    const targetDepth = Math.max(event.stack.length - 1, 0);

    while (callIdStack.length > targetDepth) {
      const closedId = callIdStack.pop();
      if (closedId === undefined) break;
      const closed = nodeById.get(closedId);
      if (closed && closed.returnStep === null) {
        nodeById.set(closedId, { ...closed, returnStep: event.step });
      }
    }

    while (callIdStack.length < targetDepth) {
      const frame = event.stack[callIdStack.length + 1];
      if (!frame) break;
      const parentId = callIdStack[callIdStack.length - 1] ?? null;
      const id = `call-${order}`;
      const node: RecursionNode = {
        id,
        fnName: frame.fnName,
        parentId,
        callStep: event.step,
        callLine: frame.line,
        returnStep: null,
        args: { ...frame.locals },
        order,
      };
      order++;
      nodeById.set(id, node);
      insertionOrder.push(id);
      if (parentId) edges.push({ from: parentId, to: id });
      callIdStack.push(id);
    }
  }

  const nodes = insertionOrder.map((id) => nodeById.get(id)!);
  return { nodes, edges };
}

export type NodeStatus = "active" | "done" | "pending";

/**
 * Classifies every node's status relative to a single step index.
 * "active" = on the call stack at that step, "done" = already returned,
 * "pending" = not yet called (visible ahead of time since the whole
 * trace is known upfront).
 */
export function statusAtStep(tree: RecursionTree, currentStep: number): Map<string, NodeStatus> {
  const result = new Map<string, NodeStatus>();
  for (const node of tree.nodes) {
    if (currentStep < node.callStep) {
      result.set(node.id, "pending");
    } else if (node.returnStep !== null && currentStep >= node.returnStep) {
      result.set(node.id, "done");
    } else {
      result.set(node.id, "active");
    }
  }
  return result;
}
