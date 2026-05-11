import type { TraceResult } from "@/trace/types";

export type LanguageId = "python" | "javascript" | "java";

export interface LanguageAdapter {
  id: LanguageId;
  displayName: string;
  fileExtension: string;
  defaultSample: string;
  trace(source: string, opts?: { maxSteps?: number }): Promise<TraceResult>;
}
