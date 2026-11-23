export function serialPoll(task: () => Promise<void>) {
  let running = false;
  return async () => {
    if (running) return;
    running = true;
    try {
      await task();
    } finally {
      running = false;
    }
  };
}
export function orderViewChanged(
  current: { id: string; version: number; status: string },
  fresh: { id: string; version: number; status: string },
) {
  return (
    current.id !== fresh.id ||
    current.version !== fresh.version ||
    current.status !== fresh.status
  );
}
