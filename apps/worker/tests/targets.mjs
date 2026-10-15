// These suites drop schemas and flush Redis. A database name alone is not isolation.
export function integrationTargets(env = process.env) {
  const databaseUrl = 'postgres://flare_test:local-test-only@127.0.0.1:15432/flare_test';
  const redisUrl = 'redis://127.0.0.1:16379/15';
  if (
    (env.TEST_DATABASE_URL !== undefined && env.TEST_DATABASE_URL !== databaseUrl) ||
    (env.TEST_REDIS_URL !== undefined && env.TEST_REDIS_URL !== redisUrl)
  )
    throw new Error(
      'Integration tests require the exact disposable loopback endpoints from scripts/integration.sh; custom database and Redis targets are refused',
    );
  return { databaseUrl, redisUrl };
}
