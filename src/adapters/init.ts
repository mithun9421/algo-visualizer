import { javascriptAdapter } from "./javascript";
import { pythonAdapter } from "./python";
import { javaAdapter } from "./java";
import { registerAdapter } from "./registry";

let initialized = false;

export function initAdapters(): void {
  if (initialized) return;
  initialized = true;
  registerAdapter(javascriptAdapter);
  registerAdapter(pythonAdapter);
  registerAdapter(javaAdapter);
}
