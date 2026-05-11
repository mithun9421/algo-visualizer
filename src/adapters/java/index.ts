import type { LanguageAdapter } from "../types";

const COMING_SOON = `// Java support is coming soon.
// The adapter will use java-parser + a tree-walking interpreter for
// the same Python-style subset: primitives, if/else, for/while,
// arrays, methods, recursion, System.out.println.

public class Demo {
    public static void main(String[] args) {
        int x = 1 + 2;
        System.out.println(x);
    }
}`;

export const javaAdapter: LanguageAdapter = {
  id: "java",
  displayName: "Java",
  fileExtension: "java",
  defaultSample: COMING_SOON,
  async trace(): Promise<never> {
    throw new Error(
      "Java support is not yet implemented. See PRD §8 (long-term roadmap)."
    );
  },
};
