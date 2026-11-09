import "server-only";
import { createHash } from "node:crypto";
import { CacheCoordinator, resolveRedisConfiguration, type CacheBackend, type CacheNamespace, type CacheRequest, type CacheMetrics } from "@/lib/server-cache-core";

class RedisRestBackend implements CacheBackend {
  private readonly baseUrl: string;
  private readonly token: string;
  private unavailableUntil = 0;

  constructor(url: string, token: string) {
    this.baseUrl = url.replace(/\/+$/, "");
    this.token = token;
  }

  private async execute(commands: string[][]): Promise<unknown[]> {
    if (Date.now() < this.unavailableUntil) throw new Error("CACHE_CIRCUIT_OPEN");
    try {
      const response = await fetch(`${this.baseUrl}/pipeline`, {
        method: "POST",
        headers: { authorization: `Bearer ${this.token}`, "content-type": "application/json" },
        body: JSON.stringify(commands),
        signal: AbortSignal.timeout(1200),
        cache: "no-store",
      });
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          this.unavailableUntil = Date.now() + 60_000;
          throw new Error("CACHE_AUTHENTICATION_ERROR");
        }
        throw new Error("CACHE_PROVIDER_ERROR");
      }
      const results: unknown = await response.json();
      if (!Array.isArray(results)) throw new Error("CACHE_INVALID_RESPONSE");
      const errors = results.find((item) => Boolean(item && typeof item === "object" && "error" in item && (item as { error?: unknown }).error));
      if (errors) throw new Error("CACHE_COMMAND_ERROR");
      this.unavailableUntil = 0;
      return results.map((item) => item && typeof item === "object" && "result" in item ? (item as { result: unknown }).result : null);
    } catch (error) {
      if (!(error instanceof Error && error.message === "CACHE_AUTHENTICATION_ERROR")) this.unavailableUntil = Date.now() + 5000;
      throw error;
    }
  }

  async get(key: string): Promise<string | null> {
    const result = (await this.execute([["GET", key]]))[0];
    return typeof result === "string" ? result : null;
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    await this.execute([["SET", key, value, "EX", String(ttlSeconds)]]);
  }

  async delete(key: string): Promise<void> {
    await this.execute([["DEL", key]]);
  }

  async getVersions(tags: string[]): Promise<number[]> {
    if (!tags.length) return [];
    const values = await this.execute(tags.map((tag) => ["GET", tag]));
    return values.map((value) => typeof value === "string" && /^\d+$/.test(value) ? Number(value) : 0);
  }

  async bumpTags(tags: string[]): Promise<void> {
    if (tags.length) await this.execute(tags.map((tag) => ["INCR", tag]));
  }

  async healthCheck(): Promise<boolean> {
    return (await this.execute([["PING"]]))[0] === "PONG";
  }
}

function cacheError(operation: string, error: unknown) {
  const safeCode = error instanceof Error && /^CACHE_[A-Z_]+$/.test(error.message) ? error.message : undefined;
  console.warn(JSON.stringify({ level: "warn", event: "cache.redis_error", operation, errorCode: safeCode, errorType: error instanceof Error ? error.name : "unknown" }));
}

const redisConfig = resolveRedisConfiguration(process.env);
if (redisConfig.missing) {
  console.warn(JSON.stringify({ level: "warn", event: "cache.redis_config_missing", action: "database_fallback" }));
}
if (redisConfig.invalidUrl) {
  console.warn(JSON.stringify({ level: "warn", event: "cache.redis_url_invalid", action: "database_fallback" }));
}
const backend = redisConfig.enabled && redisConfig.url && redisConfig.token ? new RedisRestBackend(redisConfig.url, redisConfig.token) : null;
const coordinator = new CacheCoordinator(backend, (value) => createHash("sha256").update(value).digest("hex"), cacheError);
let lastDevelopmentMetricsLog = 0;

export function getCached<T>(request: CacheRequest<T>): Promise<T> {
  if (process.env.NODE_ENV === "development" && Date.now() - lastDevelopmentMetricsLog >= 60_000) {
    lastDevelopmentMetricsLog = Date.now();
    console.debug(JSON.stringify({ event: "cache.metrics", ...coordinator.getMetrics(), redisConfigured: backend !== null }));
  }
  return coordinator.getOrCompute(request);
}

export function invalidateCacheTags(tags: string[]): Promise<void> {
  return coordinator.invalidate(tags);
}

export function getCacheMetrics(): Readonly<CacheMetrics & { hitRatio: number }> {
  return coordinator.getMetrics();
}

export function checkCacheHealth(): Promise<boolean> {
  return coordinator.healthCheck();
}

export function isSharedCacheConfigured(): boolean {
  return backend !== null;
}

export function scopedCacheTag(namespace: CacheNamespace, resource: string): string {
  return `${namespace}:${resource}`;
}
