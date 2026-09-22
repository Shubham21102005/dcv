// Idle-based auto-lock: the timer resets on any pointer/key activity and on the
// tab becoming visible again, so the wallet never locks mid-demo while in use.
export interface IdleLockHandle {
  stop: () => void;
  /** Manually reset the timer (e.g. after a successful action). */
  touch: () => void;
}

export function startIdleLock(opts: {
  seconds: number;
  onIdle: () => void;
  target?: Pick<Window, 'addEventListener' | 'removeEventListener'>;
  setTimeout?: typeof setTimeout;
  clearTimeout?: typeof clearTimeout;
}): IdleLockHandle {
  const target = opts.target ?? globalThis.window;
  const set = opts.setTimeout ?? globalThis.setTimeout.bind(globalThis);
  const clear = opts.clearTimeout ?? globalThis.clearTimeout.bind(globalThis);
  let timer: ReturnType<typeof setTimeout> | null = null;
  const arm = () => {
    if (timer !== null) clear(timer);
    timer = set(() => opts.onIdle(), opts.seconds * 1000);
  };
  const events = ['pointerdown', 'keydown', 'visibilitychange'] as const;
  for (const e of events) target.addEventListener(e, arm);
  arm();
  return {
    touch: arm,
    stop: () => {
      if (timer !== null) clear(timer);
      timer = null;
      for (const e of events) target.removeEventListener(e, arm);
    },
  };
}
