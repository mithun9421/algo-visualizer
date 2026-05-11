import type { TraceEvent } from "@/trace/types";

export const MOCK_SOURCE = `function sum(n) {
  let total = 0;
  for (let i = 1; i <= n; i++) {
    total += i;
  }
  return total;
}
sum(3);`;

const frame = (line: number, locals: Record<string, number | undefined | null>) => ({
  fnName: "sum",
  line,
  locals: locals as Record<string, number | null | undefined>,
});

export const MOCK_TRACE: TraceEvent[] = [
  { step: 0, line: 1, event: "call", stack: [frame(1, { n: 3 })], heap: {}, stdout: "" },
  { step: 1, line: 2, event: "step", stack: [frame(2, { n: 3, total: 0 })], heap: {}, stdout: "" },
  { step: 2, line: 3, event: "step", stack: [frame(3, { n: 3, total: 0, i: 1 })], heap: {}, stdout: "" },
  { step: 3, line: 4, event: "step", stack: [frame(4, { n: 3, total: 1, i: 1 })], heap: {}, stdout: "" },
  { step: 4, line: 3, event: "step", stack: [frame(3, { n: 3, total: 1, i: 2 })], heap: {}, stdout: "" },
  { step: 5, line: 4, event: "step", stack: [frame(4, { n: 3, total: 3, i: 2 })], heap: {}, stdout: "" },
  { step: 6, line: 3, event: "step", stack: [frame(3, { n: 3, total: 3, i: 3 })], heap: {}, stdout: "" },
  { step: 7, line: 4, event: "step", stack: [frame(4, { n: 3, total: 6, i: 3 })], heap: {}, stdout: "" },
  { step: 8, line: 3, event: "step", stack: [frame(3, { n: 3, total: 6, i: 4 })], heap: {}, stdout: "" },
  { step: 9, line: 6, event: "return", stack: [frame(6, { n: 3, total: 6, i: 4 })], heap: {}, stdout: "sum(3) = 6\n" },
];
