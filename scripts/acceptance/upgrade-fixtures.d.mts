import type { Sql } from '../../packages/db/src/index.js';
export function seedUpgradeFixtures(sql: Sql): Promise<void>;
export function captureUpgradeRows(sql: Sql): Promise<Record<string, Record<string, unknown>[]>>;
export function assertPreservedRows(
  expected: Record<string, Record<string, unknown>[]>,
  actual: Record<string, Record<string, unknown>[]>,
  migrated: boolean,
): void;
