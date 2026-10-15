export function loadConfig(env?: Record<string, string | undefined>): {
  seconds: number;
  memoryMax: number;
  latencyMax: number;
};
export function percentile(values: readonly number[], fraction: number): number;
export function remember<K>(map: Map<K, string>, logical: K, id: unknown): void;
export function assertExactReceipts(
  expectedSubjects: readonly string[],
  messages: readonly { Subject: string }[],
): void;
