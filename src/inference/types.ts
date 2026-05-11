export type ShapeKind = "linkedList" | "tree" | "graph" | "object";

export interface LinkedListShape {
  kind: "linkedList";
  rootId: string;
  chain: string[];           // ordered node ids, head → tail
  nextField: string;         // e.g. "next" / "prev" / "child"
}

export interface TreeShape {
  kind: "tree";
  rootId: string;
  nodes: string[];
  edges: { from: string; to: string; label: string }[];
  childFields: string[];     // e.g. ["left", "right"]
}

export interface GraphShape {
  kind: "graph";
  rootId: string;
  nodes: string[];
  edges: { from: string; to: string }[];
}

export interface ObjectShape {
  kind: "object";
  id: string;
}

export type AnyShape = LinkedListShape | TreeShape | GraphShape | ObjectShape;
