import { javascriptAdapter } from "./javascript";
import { javaAdapter } from "./java";
import { registerAdapter } from "./registry";

let initialized = false;

export function initAdapters(): void {
  if (initialized) return;
  initialized = true;
  registerAdapter(javascriptAdapter);
  registerAdapter(javaAdapter);
  // Python adapter registers itself when Phase 7 lands.
}
