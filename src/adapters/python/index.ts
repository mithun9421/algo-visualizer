import type { LanguageAdapter } from "../types";
import type { TraceResult } from "@/trace/types";
import { tokenize, LexError } from "./lexer";
import { parse, ParseError } from "./parser";
import { run } from "./interpreter";
import { SAMPLE_PY_BUBBLE_SORT } from "@/samples/python";

export const pythonAdapter: LanguageAdapter = {
  id: "python",
  displayName: "Python",
  fileExtension: "py",
  defaultSample: SAMPLE_PY_BUBBLE_SORT,
  async trace(source, opts): Promise<TraceResult> {
    try {
      const tokens = tokenize(source);
      const ast = parse(tokens);
      return run(ast, { maxSteps: opts?.maxSteps });
    } catch (e) {
      if (e instanceof LexError || e instanceof ParseError) {
        return {
          events: [],
          truncated: false,
          diagnostics: [{ line: e.line, col: e.col, message: e.message, severity: "error" }],
        };
      }
      const msg = e instanceof Error ? e.message : String(e);
      return {
        events: [],
        truncated: false,
        diagnostics: [{ line: 1, col: 1, message: msg, severity: "error" }],
      };
    }
  },
};
