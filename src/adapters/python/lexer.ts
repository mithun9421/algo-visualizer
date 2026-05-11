// Minimal Python lexer for the subset declared in PRD §3.
// Indent-aware. Emits INDENT/DEDENT tokens for layout.

export type TokenKind =
  | "NUMBER"
  | "STRING"
  | "NAME"
  | "KEYWORD"
  | "OP"
  | "NEWLINE"
  | "INDENT"
  | "DEDENT"
  | "EOF";

export interface Token {
  kind: TokenKind;
  value: string;
  line: number;
  col: number;
}

export class LexError extends Error {
  constructor(message: string, public line: number, public col: number) {
    super(`Lex error (line ${line}:${col}): ${message}`);
  }
}

const KEYWORDS = new Set([
  "def", "return", "if", "elif", "else", "for", "while", "in",
  "break", "continue", "pass", "and", "or", "not", "True", "False",
  "None", "is",
]);

// Multi-char ops first so the longest match wins.
const OPS = [
  "**=", "//=",
  "==", "!=", "<=", ">=", "**", "//", "->", "+=", "-=", "*=", "/=", "%=",
  "+", "-", "*", "/", "%", "<", ">", "=", "(", ")", "[", "]", "{", "}",
  ",", ":", ".", ";",
];

export function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  const lines = source.split(/\r?\n/);
  const indentStack: number[] = [0];

  let line = 0;
  while (line < lines.length) {
    const raw = lines[line];
    line++; // 1-indexed line numbers from here

    // Determine indent
    let i = 0;
    let indent = 0;
    while (i < raw.length && (raw[i] === " " || raw[i] === "\t")) {
      indent += raw[i] === "\t" ? 8 : 1;
      i++;
    }

    // Blank or comment-only lines: skip without emitting NEWLINE or indent change
    if (i === raw.length || raw[i] === "#") continue;

    // Emit INDENT / DEDENT
    const top = indentStack[indentStack.length - 1];
    if (indent > top) {
      indentStack.push(indent);
      tokens.push({ kind: "INDENT", value: "", line, col: 1 });
    } else if (indent < top) {
      while (indentStack.length > 1 && indentStack[indentStack.length - 1] > indent) {
        indentStack.pop();
        tokens.push({ kind: "DEDENT", value: "", line, col: 1 });
      }
      if (indentStack[indentStack.length - 1] !== indent) {
        throw new LexError("inconsistent indentation", line, indent + 1);
      }
    }

    // Tokenize the rest of the line
    let col = i + 1;
    while (i < raw.length) {
      const c = raw[i];

      // skip whitespace
      if (c === " " || c === "\t") { i++; col++; continue; }

      // comment to end of line
      if (c === "#") break;

      // number
      if (/[0-9]/.test(c)) {
        let j = i;
        let sawDot = false;
        while (j < raw.length && (/[0-9]/.test(raw[j]) || (raw[j] === "." && !sawDot))) {
          if (raw[j] === ".") sawDot = true;
          j++;
        }
        tokens.push({ kind: "NUMBER", value: raw.slice(i, j), line, col });
        col += j - i;
        i = j;
        continue;
      }

      // string
      if (c === '"' || c === "'") {
        const quote = c;
        let j = i + 1;
        while (j < raw.length && raw[j] !== quote) {
          if (raw[j] === "\\" && j + 1 < raw.length) j += 2;
          else j++;
        }
        if (j >= raw.length) throw new LexError("unterminated string", line, col);
        // strip quotes; minimal escape handling
        const literal = raw.slice(i + 1, j).replace(/\\(.)/g, (_, ch) => {
          switch (ch) {
            case "n": return "\n";
            case "t": return "\t";
            case "r": return "\r";
            case "\\": return "\\";
            case "'": return "'";
            case '"': return '"';
            default: return ch;
          }
        });
        tokens.push({ kind: "STRING", value: literal, line, col });
        col += j - i + 1;
        i = j + 1;
        continue;
      }

      // identifier / keyword
      if (/[A-Za-z_]/.test(c)) {
        let j = i;
        while (j < raw.length && /[A-Za-z0-9_]/.test(raw[j])) j++;
        const word = raw.slice(i, j);
        tokens.push({
          kind: KEYWORDS.has(word) ? "KEYWORD" : "NAME",
          value: word,
          line,
          col,
        });
        col += j - i;
        i = j;
        continue;
      }

      // operator (longest match)
      let matched: string | null = null;
      for (const op of OPS) {
        if (raw.startsWith(op, i)) { matched = op; break; }
      }
      if (matched) {
        tokens.push({ kind: "OP", value: matched, line, col });
        i += matched.length;
        col += matched.length;
        continue;
      }

      throw new LexError(`unexpected character ${JSON.stringify(c)}`, line, col);
    }

    tokens.push({ kind: "NEWLINE", value: "", line, col });
  }

  // Close any remaining indents.
  while (indentStack.length > 1) {
    indentStack.pop();
    tokens.push({ kind: "DEDENT", value: "", line, col: 1 });
  }
  tokens.push({ kind: "EOF", value: "", line: line + 1, col: 1 });

  return tokens;
}
