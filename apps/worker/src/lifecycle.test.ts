import { afterEach, expect, it, vi } from 'vitest';
import { periodicTask } from './lifecycle.js';

afterEach(() => vi.useRealTimers());

it('drains an active dispatch before queues close and never starts another poll after stop', async () => {
  vi.useFakeTimers();
  const events: string[] = [];
  let release!: () => void;
  const dispatch = vi.fn(async () => {
    events.push('recovery');
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    events.push('enqueue');
  });
  const poll = periodicTask(100, dispatch, () => {
    throw new Error('Unexpected failure');
  });
  await vi.advanceTimersByTimeAsync(100);
  await vi.advanceTimersByTimeAsync(500);
  expect(dispatch).toHaveBeenCalledTimes(1);
  const shutdown = poll.stop().then(() => {
    events.push('queue closed');
  });
  await vi.advanceTimersByTimeAsync(500);
  expect(events).toEqual(['recovery']);
  release();
  await shutdown;
  await poll.stop();
  await vi.advanceTimersByTimeAsync(500);
  expect(events).toEqual(['recovery', 'enqueue', 'queue closed']);
  expect(dispatch).toHaveBeenCalledTimes(1);
});

it('reports asynchronous and synchronous failures and permits a later retry', async () => {
  vi.useFakeTimers();
  const error = new Error('Dependency unavailable');
  const failed = vi.fn();
  const work = vi
    .fn()
    .mockRejectedValueOnce(error)
    .mockImplementationOnce(() => {
      throw error;
    })
    .mockResolvedValue(undefined);
  const poll = periodicTask(100, work, failed);
  await vi.advanceTimersByTimeAsync(300);
  expect(work).toHaveBeenCalledTimes(3);
  expect(failed).toHaveBeenCalledTimes(2);
  expect(failed).toHaveBeenCalledWith(error);
  await poll.stop();
});

it('can stop before the first tick without invoking work', async () => {
  vi.useFakeTimers();
  const work = vi.fn();
  const poll = periodicTask(100, work, vi.fn());
  await poll.stop();
  await vi.advanceTimersByTimeAsync(1000);
  expect(work).not.toHaveBeenCalled();
});
