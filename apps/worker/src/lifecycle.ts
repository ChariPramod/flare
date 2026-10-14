/** Stop scheduling before draining work, so queue and database shutdown cannot race a poll. */
export function periodicTask(
  milliseconds: number,
  work: () => PromiseLike<unknown>,
  onError: (error: unknown) => void,
) {
  let stopped = false;
  let active: Promise<void> | undefined;
  const timer = setInterval(() => {
    if (stopped || active) return;
    active = Promise.resolve()
      .then(() => work())
      .then(() => undefined)
      .catch(onError)
      .finally(() => {
        active = undefined;
      });
  }, milliseconds);
  return {
    async stop() {
      stopped = true;
      clearInterval(timer);
      await active;
    },
  };
}
