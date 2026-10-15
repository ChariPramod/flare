import assert from 'node:assert/strict';

export function loadConfig(env = process.env) {
  const integer = (name, fallback, min, max) => {
    const value = Number(env[name] ?? fallback);
    assert.ok(
      Number.isInteger(value) && value >= min && value <= max,
      `${name} must be an integer from ${min} to ${max}`,
    );
    return value;
  };
  return {
    seconds: integer('ACCEPTANCE_SOAK_SECONDS', 180, 120, 1800),
    memoryMax: integer('ACCEPTANCE_MEMORY_MAX_BYTES', 805306368, 67108864, 2147483648),
    latencyMax: integer('ACCEPTANCE_SOAK_P95_MS', 5000, 100, 30000),
  };
}

export function percentile(values, fraction) {
  assert.ok(values.length > 0 && fraction > 0 && fraction <= 1);
  return [...values].sort((a, b) => a - b)[Math.ceil(values.length * fraction) - 1];
}

export function remember(map, logical, id) {
  assert.equal(typeof id, 'string');
  if (map.has(logical))
    assert.equal(map.get(logical), id, 'A logical operation returned a second identity');
  map.set(logical, id);
}

export function assertExactReceipts(expectedSubjects, messages) {
  const expected = new Set(expectedSubjects);
  assert.equal(expected.size, expectedSubjects.length, 'Expected subjects must be unique');
  const counts = new Map();
  for (const message of messages) {
    if (expected.has(message.Subject))
      counts.set(message.Subject, (counts.get(message.Subject) ?? 0) + 1);
  }
  assert.equal(counts.size, expected.size, 'An accepted logical email is missing from Mailpit');
  assert.ok(
    [...counts.values()].every((count) => count === 1),
    'Mailpit received duplicate logical email',
  );
}
