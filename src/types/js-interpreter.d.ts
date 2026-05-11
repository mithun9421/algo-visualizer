declare module "js-interpreter" {
  type PseudoValue = unknown;

  interface AstNode {
    type: string;
    loc?: { start?: { line: number; column: number }; end?: { line: number; column: number } };
    id?: { name?: string };
    [key: string]: unknown;
  }

  interface Scope {
    object: { properties: Record<string, unknown> };
    parentScope?: Scope;
    strict?: boolean;
  }

  interface State {
    node?: AstNode;
    scope?: Scope;
    func_?: PseudoValue & { node?: AstNode };
    [key: string]: unknown;
  }

  class Interpreter {
    constructor(
      code: string,
      initFunc?: (interpreter: Interpreter, globalObject: unknown) => void
    );
    step(): boolean;
    run(): boolean;
    getStateStack(): State[];
    nativeToPseudo(value: unknown): PseudoValue;
    pseudoToNative(value: unknown): unknown;
    setProperty(obj: unknown, name: string | number, value: unknown): void;
    getProperty(obj: unknown, name: string | number): unknown;
    createNativeFunction(fn: (...args: unknown[]) => unknown, isConstructor?: boolean): PseudoValue;
  }

  export default Interpreter;
  export = Interpreter;
}
