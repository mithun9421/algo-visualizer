// Recursive-descent parser for the Python subset.
// Operator precedence climbs through layers: or > and > not > comparison >
// arithmetic. Inspired by CPython's official grammar but trimmed.

import type { Token } from "./lexer";
import type {
  AssignTarget, Expr, Statement, Module, Loc,
} from "./ast";

export class ParseError extends Error {
  constructor(message: string, public line: number, public col: number) {
    super(`Parse error (line ${line}:${col}): ${message}`);
  }
}

export function parse(tokens: Token[]): Module {
  const p = new Parser(tokens);
  return p.parseModule();
}

class Parser {
  private i = 0;
  constructor(private toks: Token[]) {}

  parseModule(): Module {
    const body: Statement[] = [];
    while (!this.isAtEnd()) {
      // Skip stray NEWLINEs at top level
      if (this.peek().kind === "NEWLINE") { this.i++; continue; }
      body.push(this.parseStatement());
    }
    return { type: "Module", body };
  }

  // -------- statements --------

  private parseStatement(): Statement {
    const t = this.peek();
    if (t.kind === "KEYWORD") {
      switch (t.value) {
        case "def": return this.parseDef();
        case "if": return this.parseIf();
        case "while": return this.parseWhile();
        case "for": return this.parseFor();
        case "return": return this.parseReturn();
        case "break": this.i++; this.consumeNewline(); return { type: "Break", loc: loc(t) };
        case "continue": this.i++; this.consumeNewline(); return { type: "Continue", loc: loc(t) };
        case "pass": this.i++; this.consumeNewline(); return { type: "Pass", loc: loc(t) };
      }
    }
    return this.parseSimpleStmt();
  }

  private parseDef(): Statement {
    const def = this.expectKeyword("def");
    const name = this.expectName().value;
    this.expectOp("(");
    const params: string[] = [];
    if (!this.match("OP", ")")) {
      do {
        params.push(this.expectName().value);
      } while (this.match("OP", ","));
      this.expectOp(")");
    }
    this.expectOp(":");
    const body = this.parseSuite();
    return { type: "FunctionDef", name, params, body, loc: loc(def) };
  }

  private parseIf(): Statement {
    const ifTok = this.expectKeyword("if");
    const test = this.parseExpr();
    this.expectOp(":");
    const body = this.parseSuite();
    let orelse: Statement[] = [];
    if (this.checkKeyword("elif")) {
      // recursively treat elif as a single nested If
      const sub = this.parseIf();
      orelse = [sub];
    } else if (this.match("KEYWORD", "else")) {
      this.expectOp(":");
      orelse = this.parseSuite();
    }
    return { type: "If", test, body, orelse, loc: loc(ifTok) };
  }

  private parseWhile(): Statement {
    const tok = this.expectKeyword("while");
    const test = this.parseExpr();
    this.expectOp(":");
    const body = this.parseSuite();
    return { type: "While", test, body, loc: loc(tok) };
  }

  private parseFor(): Statement {
    const tok = this.expectKeyword("for");
    const target = this.expectName().value;
    this.expectKeyword("in");
    const iter = this.parseExpr();
    this.expectOp(":");
    const body = this.parseSuite();
    return { type: "For", target, iter, body, loc: loc(tok) };
  }

  private parseReturn(): Statement {
    const tok = this.expectKeyword("return");
    let value: Expr | null = null;
    if (this.peek().kind !== "NEWLINE") value = this.parseExpr();
    this.consumeNewline();
    return { type: "Return", value, loc: loc(tok) };
  }

  private parseSuite(): Statement[] {
    // suite = NEWLINE INDENT stmt+ DEDENT
    this.expect("NEWLINE");
    this.expect("INDENT");
    const stmts: Statement[] = [];
    while (this.peek().kind !== "DEDENT" && !this.isAtEnd()) {
      if (this.peek().kind === "NEWLINE") { this.i++; continue; }
      stmts.push(this.parseStatement());
    }
    this.expect("DEDENT");
    return stmts;
  }

  private parseSimpleStmt(): Statement {
    const start = this.peek();
    const target = this.parseExpr();

    // augmented assignment?
    const augOps = ["+=", "-=", "*=", "/=", "%=", "//=", "**="];
    if (this.peek().kind === "OP" && augOps.includes(this.peek().value)) {
      const opTok = this.advance();
      const value = this.parseExpr();
      this.consumeNewline();
      const at = exprToAssignTarget(target);
      if (!at) throw new ParseError("invalid augassign target", opTok.line, opTok.col);
      return {
        type: "AugAssign",
        target: at,
        op: opTok.value.replace("=", ""),
        value,
        loc: loc(start),
      };
    }

    // plain assignment?
    if (this.match("OP", "=")) {
      const targets: AssignTarget[] = [];
      const t1 = exprToAssignTarget(target);
      if (!t1) throw new ParseError("invalid assignment target", start.line, start.col);
      targets.push(t1);
      // Chain like a = b = c (right-associative)
      let value = this.parseExpr();
      while (this.match("OP", "=")) {
        const next = exprToAssignTarget(value);
        if (!next) throw new ParseError("invalid assignment target", start.line, start.col);
        targets.push(next);
        value = this.parseExpr();
      }
      this.consumeNewline();
      return { type: "Assign", targets, value, loc: loc(start) };
    }

    this.consumeNewline();
    return { type: "ExprStmt", expr: target, loc: loc(start) };
  }

  // -------- expressions (precedence climbing) --------

  private parseExpr(): Expr { return this.parseOr(); }

  private parseOr(): Expr {
    let left = this.parseAnd();
    while (this.match("KEYWORD", "or")) {
      const right = this.parseAnd();
      left = { type: "BoolOp", op: "or", left, right, loc: left.loc };
    }
    return left;
  }
  private parseAnd(): Expr {
    let left = this.parseNot();
    while (this.match("KEYWORD", "and")) {
      const right = this.parseNot();
      left = { type: "BoolOp", op: "and", left, right, loc: left.loc };
    }
    return left;
  }
  private parseNot(): Expr {
    if (this.match("KEYWORD", "not")) {
      const operand = this.parseNot();
      return { type: "UnaryOp", op: "not", operand, loc: operand.loc };
    }
    return this.parseCompare();
  }
  private parseCompare(): Expr {
    let left = this.parseAdd();
    const compOps = ["<", ">", "<=", ">=", "==", "!="];
    while (this.peek().kind === "OP" && compOps.includes(this.peek().value)) {
      const op = this.advance().value;
      const right = this.parseAdd();
      left = { type: "Compare", op, left, right, loc: left.loc };
    }
    // `is`, `is not`, `in`, `not in` — minimal support: 'is'
    if (this.match("KEYWORD", "is")) {
      const negated = this.match("KEYWORD", "not");
      const right = this.parseAdd();
      const op = negated ? "is not" : "is";
      left = { type: "Compare", op, left, right, loc: left.loc };
    }
    if (this.checkKeyword("in")) {
      this.advance();
      const right = this.parseAdd();
      left = { type: "Compare", op: "in", left, right, loc: left.loc };
    }
    return left;
  }
  private parseAdd(): Expr {
    let left = this.parseMul();
    while (this.peek().kind === "OP" && (this.peek().value === "+" || this.peek().value === "-")) {
      const op = this.advance().value;
      const right = this.parseMul();
      left = { type: "BinOp", op, left, right, loc: left.loc };
    }
    return left;
  }
  private parseMul(): Expr {
    let left = this.parseUnary();
    while (this.peek().kind === "OP" &&
           (this.peek().value === "*" || this.peek().value === "/"
            || this.peek().value === "%" || this.peek().value === "//")) {
      const op = this.advance().value;
      const right = this.parseUnary();
      left = { type: "BinOp", op, left, right, loc: left.loc };
    }
    return left;
  }
  private parseUnary(): Expr {
    if (this.peek().kind === "OP" && (this.peek().value === "-" || this.peek().value === "+")) {
      const op = this.advance().value;
      const operand = this.parseUnary();
      return { type: "UnaryOp", op, operand, loc: operand.loc };
    }
    return this.parsePower();
  }
  private parsePower(): Expr {
    const base = this.parseAtomTrailer();
    if (this.match("OP", "**")) {
      const exp = this.parseUnary(); // right-associative
      return { type: "BinOp", op: "**", left: base, right: exp, loc: base.loc };
    }
    return base;
  }

  private parseAtomTrailer(): Expr {
    let node = this.parseAtom();
    for (;;) {
      if (this.match("OP", "(")) {
        const args: Expr[] = [];
        if (!this.match("OP", ")")) {
          do { args.push(this.parseExpr()); } while (this.match("OP", ","));
          this.expectOp(")");
        }
        node = { type: "Call", callee: node, args, loc: node.loc };
      } else if (this.match("OP", "[")) {
        const index = this.parseExpr();
        this.expectOp("]");
        node = { type: "Subscript", obj: node, index, loc: node.loc };
      } else if (this.match("OP", ".")) {
        const name = this.expectName().value;
        node = { type: "Attribute", obj: node, name, loc: node.loc };
      } else {
        break;
      }
    }
    return node;
  }

  private parseAtom(): Expr {
    const t = this.peek();
    if (t.kind === "NUMBER") {
      this.i++;
      return { type: "Num", value: Number(t.value), loc: loc(t) };
    }
    if (t.kind === "STRING") {
      this.i++;
      return { type: "Str", value: t.value, loc: loc(t) };
    }
    if (t.kind === "KEYWORD") {
      if (t.value === "True") { this.i++; return { type: "Bool", value: true, loc: loc(t) }; }
      if (t.value === "False") { this.i++; return { type: "Bool", value: false, loc: loc(t) }; }
      if (t.value === "None") { this.i++; return { type: "None", loc: loc(t) }; }
    }
    if (t.kind === "NAME") {
      this.i++;
      return { type: "Name", name: t.value, loc: loc(t) };
    }
    if (t.kind === "OP" && t.value === "(") {
      this.i++;
      // empty tuple
      if (this.match("OP", ")")) return { type: "Tuple", items: [], loc: loc(t) };
      const first = this.parseExpr();
      // parenthesized expr or tuple?
      if (this.match("OP", ",")) {
        const items = [first];
        if (this.peek().kind === "OP" && this.peek().value === ")") {
          this.advance();
          return { type: "Tuple", items, loc: loc(t) };
        }
        do { items.push(this.parseExpr()); } while (this.match("OP", ","));
        this.expectOp(")");
        return { type: "Tuple", items, loc: loc(t) };
      }
      this.expectOp(")");
      return first;
    }
    if (t.kind === "OP" && t.value === "[") {
      this.i++;
      const items: Expr[] = [];
      if (!this.match("OP", "]")) {
        do { items.push(this.parseExpr()); } while (this.match("OP", ","));
        this.expectOp("]");
      }
      return { type: "List", items, loc: loc(t) };
    }
    if (t.kind === "OP" && t.value === "{") {
      this.i++;
      const items: Array<{ key: Expr; value: Expr }> = [];
      if (!this.match("OP", "}")) {
        do {
          const key = this.parseExpr();
          this.expectOp(":");
          const value = this.parseExpr();
          items.push({ key, value });
        } while (this.match("OP", ","));
        this.expectOp("}");
      }
      return { type: "Dict", items, loc: loc(t) };
    }
    throw new ParseError(`unexpected token ${t.kind}:${JSON.stringify(t.value)}`, t.line, t.col);
  }

  // -------- token helpers --------

  private peek(off = 0): Token { return this.toks[this.i + off]; }
  private advance(): Token { return this.toks[this.i++]; }
  private isAtEnd(): boolean { return this.peek().kind === "EOF"; }

  private match(kind: Token["kind"], value?: string): boolean {
    const t = this.peek();
    if (t.kind === kind && (value === undefined || t.value === value)) {
      this.i++;
      return true;
    }
    return false;
  }

  private check(kind: Token["kind"], value?: string): boolean {
    const t = this.peek();
    return t.kind === kind && (value === undefined || t.value === value);
  }

  private checkKeyword(value: string): boolean { return this.check("KEYWORD", value); }

  private expect(kind: Token["kind"]): Token {
    const t = this.peek();
    if (t.kind !== kind) throw new ParseError(`expected ${kind}, got ${t.kind}`, t.line, t.col);
    return this.advance();
  }
  private expectOp(value: string): Token {
    const t = this.peek();
    if (t.kind !== "OP" || t.value !== value) {
      throw new ParseError(`expected ${value}, got ${JSON.stringify(t.value)}`, t.line, t.col);
    }
    return this.advance();
  }
  private expectKeyword(value: string): Token {
    const t = this.peek();
    if (t.kind !== "KEYWORD" || t.value !== value) {
      throw new ParseError(`expected '${value}', got ${JSON.stringify(t.value)}`, t.line, t.col);
    }
    return this.advance();
  }
  private expectName(): Token {
    const t = this.peek();
    if (t.kind !== "NAME") throw new ParseError(`expected identifier, got ${t.kind}`, t.line, t.col);
    return this.advance();
  }

  private consumeNewline(): void {
    while (this.peek().kind === "NEWLINE") this.i++;
  }
}

function loc(t: Token): Loc { return { line: t.line, col: t.col }; }

function exprToAssignTarget(e: Expr): AssignTarget | null {
  if (e.type === "Name") return { type: "Name", name: e.name };
  if (e.type === "Subscript") return { type: "Subscript", obj: e.obj, index: e.index };
  if (e.type === "Attribute") return { type: "Attribute", obj: e.obj, name: e.name };
  return null;
}
