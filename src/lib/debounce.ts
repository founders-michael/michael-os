export function createDebouncedCallback<Args extends unknown[]>(callback: (...args: Args) => void, delay: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const run = (...args: Args) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { timer = undefined; callback(...args); }, delay);
  };
  run.cancel = () => {
    if (timer) clearTimeout(timer);
    timer = undefined;
  };
  return run;
}

export class LatestRequestGate {
  private version = 0;
  issue() { return ++this.version; }
  isCurrent(version: number) { return version === this.version; }
  invalidate() { this.version++; }
}
