import type { LanguageAdapter, LanguageId } from "./types";

const adapters = new Map<LanguageId, LanguageAdapter>();

export function registerAdapter(adapter: LanguageAdapter): void {
  adapters.set(adapter.id, adapter);
}

export function getAdapter(id: LanguageId): LanguageAdapter | undefined {
  return adapters.get(id);
}

export function listAdapters(): LanguageAdapter[] {
  return [...adapters.values()];
}
