import * as acorn from "acorn";
import { simple } from "acorn-walk";

/**
 * The bundled js-interpreter is a strict ES5 interpreter: its parser has no
 * concept of `let`/`const` at all (they aren't even keywords to it), so any
 * modern sample that uses them fails before a single line runs.
 *
 * This does a syntax-only downlevel: it parses the source with a full
 * modern (ecmaVersion "latest") Acorn, finds every `let`/`const`
 * VariableDeclaration, and rewrites its keyword to `var` in the original
 * source text. Execution then follows `var`'s function-scoping/hoisting
 * rules rather than true block scope or a temporal dead zone, and nothing
 * stops a `const` from being reassigned — a deliberate, well-understood
 * trade-off for a teaching visualizer, where the overwhelming majority of
 * sample algorithms don't depend on those finer distinctions, versus the
 * status quo of `let`/`const` being rejected outright.
 *
 * Replacements are always same-length ("let" -> "var", "const" -> "var  ")
 * so every other token keeps the exact line/column it has in the source the
 * user is looking at in the editor — the interpreter's reported line
 * numbers stay accurate for highlighting.
 *
 * Best-effort: if the modern parse itself fails (a genuine syntax error, or
 * a construct this pass doesn't know how to walk), the original source is
 * returned unchanged so the ES5 interpreter's own parser reports the error
 * the user actually sees, instead of us swallowing or duplicating it.
 */
export function downlevelLetConst(source: string): string {
  let ast: acorn.Node;
  try {
    ast = acorn.parse(source, { ecmaVersion: "latest", sourceType: "script" });
  } catch {
    return source;
  }

  const replacements: { start: number; length: number }[] = [];
  try {
    simple(ast, {
      VariableDeclaration(node) {
        if (node.kind === "let" || node.kind === "const") {
          replacements.push({ start: node.start, length: node.kind.length });
        }
      },
    });
  } catch {
    return source;
  }

  if (replacements.length === 0) return source;

  // Apply right-to-left so earlier, not-yet-processed offsets stay valid.
  replacements.sort((a, b) => b.start - a.start);
  let out = source;
  for (const { start, length } of replacements) {
    out = out.slice(0, start) + "var".padEnd(length) + out.slice(start + length);
  }
  return out;
}
