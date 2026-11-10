export type CacheNamespace = "lifestyle" | "organization" | "team" | "project" | "task" | "capacity" | "user-settings";

export type CacheRequest<T> = {
  namespace: CacheNamespace;
  scope: unknown;
  query?: unknown;
  tags?: string[];
  ttlSeconds: number;
  bypassCache?: boolean;
  compute: () => Promise<T>;
};

export type CacheMetrics = {
  hits: number;
  misses: number;
  errors: number;
  invalidations: number;
  bypasses: number;
  coalesced: number;
  readLatencyMs: number;
  readCount: number;
  writeLatencyMs: number;
  writeCount: number;
};

export interface CacheBackend {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
  delete(key: string): Promise<void>;
  getVersions(tags: string[]): Promise<number[]>;
  bumpTags(tags: string[]): Promise<void>;
  healthCheck(): Promise<boolean>;
}

export type RedisEnvironment = Record<string, string | undefined>;
export function resolveRedisConfiguration(env: RedisEnvironment) {
  const url = env.UPSTASH_REDIS_REST_URL ?? env.REDIS_REST_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN ?? env.REDIS_REST_TOKEN;
  const enabled = env.REDIS_ENABLED === "true" || (env.REDIS_ENABLED !== "false" && Boolean(url && token));
  const validUrl = url && /^https:\/\//i.test(url) ? url : undefined;
  return { enabled: enabled && Boolean(validUrl && token), configured: Boolean(validUrl && token), missing: enabled && (!url || !token), invalidUrl: enabled && Boolean(url) && !validUrl, url: validUrl, token };
}

export function stableStringify(value: unknown): string {
  if (value === undefined) return '"__undefined__"';
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(",")}}`;
}

export class CacheCoordinator {
  private readonly inflight = new Map<string, Promise<unknown>>();
  readonly metrics: CacheMetrics = { hits: 0, misses: 0, errors: 0, invalidations: 0, bypasses: 0, coalesced: 0, readLatencyMs: 0, readCount: 0, writeLatencyMs: 0, writeCount: 0 };

  constructor(private readonly backend: CacheBackend | null, private readonly hash: (value: string) => string, private readonly onError: (operation: string, error: unknown) => void = () => undefined) {}

  async getOrCompute<T>(request: CacheRequest<T>): Promise<T> {
    const base = `michaelos:v1:${request.namespace}:${this.hash(stableStringify({ scope: request.scope, query: request.query ?? null }))}`;
    const tags = (request.tags ?? []).map((tag) => `michaelos:v1:tag:${this.hash(tag)}`);
    const bypass = request.bypassCache || !this.backend;
    if (bypass) this.metrics.bypasses++;

    let key = base;
    if (!bypass && this.backend) {
      try {
        const versions = await this.backend.getVersions(tags);
        key = `${base}:${this.hash(stableStringify(versions))}`;
        const started = performance.now();
        const raw = await this.backend.get(key);
        this.metrics.readLatencyMs += performance.now() - started;
        this.metrics.readCount++;
        if (raw !== null) {
          const parsed: unknown = JSON.parse(raw);
          if (isCacheEnvelope(parsed)) {
            this.metrics.hits++;
            return parsed.value as T;
          }
          await this.backend.delete(key);
        }
        this.metrics.misses++;
      } catch (error) {
        this.metrics.errors++;
        this.onError("read", error);
      }
    }

    const existing = this.inflight.get(key);
    if (existing) {
      this.metrics.coalesced++;
      return existing as Promise<T>;
    }

    const pending = request.compute().then(async (value) => {
      if (!bypass && this.backend && request.ttlSeconds > 0) {
        try {
          const started = performance.now();
          await this.backend.set(key, JSON.stringify({ version: 1, value }), Math.min(Math.floor(request.ttlSeconds), 3600));
          this.metrics.writeLatencyMs += performance.now() - started;
          this.metrics.writeCount++;
        } catch (error) {
          this.metrics.errors++;
          this.onError("write", error);
        }
      }
      return value;
    }).finally(() => this.inflight.delete(key));
    this.inflight.set(key, pending);
    return pending;
  }

  async invalidate(tags: string[]): Promise<void> {
    if (!this.backend || tags.length === 0) return;
    try {
      await this.backend.bumpTags(tags.map((tag) => `michaelos:v1:tag:${this.hash(tag)}`));
      this.metrics.invalidations++;
    } catch (error) {
      this.metrics.errors++;
      this.onError("invalidate", error);
    }
  }

  getMetrics(): CacheMetrics & { hitRatio: number } {
    const { hits, misses } = this.metrics;
    return { ...this.metrics, hitRatio: hits + misses === 0 ? 0 : hits / (hits + misses) };
  }

  async healthCheck(): Promise<boolean> {
    return this.backend ? this.backend.healthCheck().catch((error) => { this.metrics.errors++; this.onError("health", error); return false; }) : false;
  }
}

function isCacheEnvelope(value: unknown): value is { version: 1; value: unknown } {
  return Boolean(value && typeof value === "object" && (value as { version?: unknown }).version === 1 && "value" in value);
}
