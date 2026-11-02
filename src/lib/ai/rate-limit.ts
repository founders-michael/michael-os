const WINDOW_MS = 60_000;
const MAX_REQUESTS = 12;
const MAX_TRACKED_USERS = 10_000;
const buckets = new Map<string, { startedAt: number; count: number }>();

/** Process-local development guard; use a shared limiter before multi-instance production deployment. */
export function checkAIRateLimit(userId: string, now = Date.now()) {
  if (buckets.size >= MAX_TRACKED_USERS) {
    for (const [key, value] of buckets) if (now - value.startedAt >= WINDOW_MS) buckets.delete(key);
    while (buckets.size >= MAX_TRACKED_USERS) buckets.delete(buckets.keys().next().value!);
  }
  const bucket = buckets.get(userId);
  if (!bucket || now - bucket.startedAt >= WINDOW_MS) {
    buckets.set(userId, { startedAt: now, count: 1 });
    return { allowed: true, retryAfterSeconds: 0 };
  }
  if (bucket.count >= MAX_REQUESTS) return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((bucket.startedAt + WINDOW_MS - now) / 1000)) };
  bucket.count++;
  return { allowed: true, retryAfterSeconds: 0 };
}

export function resetAIRateLimitForTests() { buckets.clear(); }

