// AST node definitions for the Python subset.

export interface Loc {
  line: number;
  col: number;
}

export type Node =
  | Module
  | FunctionDef
  | If
  | While
  | For
  | Assign
  | AugAssign
  | ExprStmt
  | ReturnStmt
  | BreakStmt
  | ContinueStmt
  | PassStmt
  | Expr;

export interface Module {
  type: "Module";
  body: Statement[];
}

export type Statement =
  | FunctionDef | If | While | For
  | Assign | AugAssign | ExprStmt
  | ReturnStmt | BreakStmt | ContinueStmt | PassStmt;

export interface FunctionDef {
  type: "FunctionDef";
  name: string;
  params: string[];
  body: Statement[];
  loc: Loc;
}

export interface If {
  type: "If";
  test: Expr;
  body: Statement[];
  orelse: Statement[];
  loc: Loc;
}

export interface While {
  type: "While";
  test: Expr;
  body: Statement[];
  loc: Loc;
}

export interface For {
  type: "For";
  target: string;
  iter: Expr;
  body: Statement[];
  loc: Loc;
}

export interface Assign {
  type: "Assign";
  targets: AssignTarget[];   // a, b = ...
  value: Expr;
  loc: Loc;
}

export type AssignTarget =
  | { type: "Name"; name: string }
  | { type: "Subscript"; obj: Expr; index: Expr }
  | { type: "Attribute"; obj: Expr; name: string };

export interface AugAssign {
  type: "AugAssign";
  target: AssignTarget;
  op: string;            // '+', '-', etc. (without '=')
  value: Expr;
  loc: Loc;
}

export interface ExprStmt {
  type: "ExprStmt";
  expr: Expr;
  loc: Loc;
}

export interface ReturnStmt {
  type: "Return";
  value: Expr | null;
  loc: Loc;
}

export interface BreakStmt { type: "Break"; loc: Loc }
export interface ContinueStmt { type: "Continue"; loc: Loc }
export interface PassStmt { type: "Pass"; loc: Loc }

export type Expr =
  | NumLit | StrLit | BoolLit | NoneLit | NameRef
  | BinOp | UnaryOp | BoolOp | CompareOp
  | Call | Subscript | Attribute
  | ListLit | DictLit | TupleLit;

export interface NumLit { type: "Num"; value: number; loc: Loc }
export interface StrLit { type: "Str"; value: string; loc: Loc }
export interface BoolLit { type: "Bool"; value: boolean; loc: Loc }
export interface NoneLit { type: "None"; loc: Loc }
export interface NameRef { type: "Name"; name: string; loc: Loc }

export interface BinOp { type: "BinOp"; op: string; left: Expr; right: Expr; loc: Loc }
export interface UnaryOp { type: "UnaryOp"; op: string; operand: Expr; loc: Loc }
export interface BoolOp { type: "BoolOp"; op: "and" | "or"; left: Expr; right: Expr; loc: Loc }
export interface CompareOp { type: "Compare"; op: string; left: Expr; right: Expr; loc: Loc }
export interface Call { type: "Call"; callee: Expr; args: Expr[]; loc: Loc }
export interface Subscript { type: "Subscript"; obj: Expr; index: Expr; loc: Loc }
export interface Attribute { type: "Attribute"; obj: Expr; name: string; loc: Loc }
export interface ListLit { type: "List"; items: Expr[]; loc: Loc }
export interface DictLit { type: "Dict"; items: Array<{ key: Expr; value: Expr }>; loc: Loc }
export interface TupleLit { type: "Tuple"; items: Expr[]; loc: Loc }
