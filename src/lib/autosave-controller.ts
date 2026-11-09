export type AutosaveStatus = "idle" | "dirty" | "saving" | "saved" | "error" | "conflict";

export class AutosaveController<T> {
  private timer: ReturnType<typeof setTimeout> | undefined;
  private latest: { value: T; version: number } | undefined;
  private version = 0;
  private processing: Promise<void> | undefined;
  private disposed = false;
  private status: AutosaveStatus = "idle";
  private listeners = new Set<(status: AutosaveStatus) => void>();

  constructor(private save: (value: T) => Promise<void>, private delay = 700) {}

  setSave(save: (value: T) => Promise<void>) { this.save = save; }
  getStatus() { return this.status; }
  subscribe(listener: (status: AutosaveStatus) => void) { this.listeners.add(listener); return () => this.listeners.delete(listener); }

  private setStatus(status: AutosaveStatus) {
    this.status = status;
    if (!this.disposed) for (const listener of this.listeners) listener(status);
  }

  schedule(value: T) {
    if (this.disposed) return;
    const version = ++this.version;
    this.latest = { value, version };
    this.setStatus("dirty");
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => { this.timer = undefined; void this.flush(); }, this.delay);
  }

  async flush() {
    if (this.timer) { clearTimeout(this.timer); this.timer = undefined; }
    if (this.processing) {
      const running = this.processing;
      await running;
      if (this.processing === running) this.processing = undefined;
      if (this.latest && this.status !== "error" && this.status !== "conflict") await this.flush();
      return;
    }
    if (!this.latest || this.disposed) return;
    const running = this.processLatest();
    this.processing = running;
    await running;
    if (this.processing === running) this.processing = undefined;
    if (this.latest && this.status !== "error" && this.status !== "conflict" && !this.disposed) await this.flush();
  }

  private async processLatest() {
    while (this.latest && !this.disposed) {
      if (this.timer) { clearTimeout(this.timer); this.timer = undefined; }
      const request = this.latest;
      this.latest = undefined;
      this.setStatus("saving");
      try {
        await this.save(request.value);
        if (request.version === this.version) this.setStatus("saved");
        else this.setStatus("dirty");
      } catch (error) {
        if (request.version !== this.version) continue;
        this.latest = request;
        const status = error && typeof error === "object" && "status" in error && (error as { status?: unknown }).status === 409 ? "conflict" : "error";
        this.setStatus(status);
        return;
      }
    }
  }

  async retry() {
    if (this.status !== "error") return;
    this.setStatus("dirty");
    await this.flush();
  }

  markSaved() { this.latest = undefined; this.version++; this.setStatus("saved"); }

  dispose() {
    this.disposed = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    this.listeners.clear();
  }
}
