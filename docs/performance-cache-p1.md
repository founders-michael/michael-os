# P1 caching and performance foundation

## Repository findings

- The project is a Next.js 16 App Router application with Cache Components and Partial Prefetching enabled. No application code currently uses `use cache`, `revalidateTag`, or `unstable_cache`.
- Protected API reads generally use `cache: "no-store"`, preserving HTTP and intermediary-cache safety.
- Initially there was no Redis integration, deployment manifest, or frontend query library. Upstash variable names have since been supplied locally; the live endpoint/token pair currently returns HTTP 401. The repository does not identify a production host.
- Page data is loaded through server-rendered props and direct browser `fetch` calls. LifestyleOS task and habit summaries were fetched again from the persistent shell and widgets.

## Cache responsibilities

- The browser uses one TanStack Query client. Current adoption deduplicates and briefly caches LifestyleOS task and habit summaries. Query keys include the authenticated user ID; WorkOS key factories include both user and organization IDs. The shell clears the client when identity/product/organization context changes and before sign-out. API fetches remain `no-store`; the browser cache is session memory only.
- Server-side Redis is optional. It auto-enables when both `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` are configured, unless `REDIS_ENABLED=false`. The first adoption is the authenticated user's organization selector list with a 15-second TTL. The route authenticates before calling the service. Its key is user scoped and its tag is invalidated after organization creation, membership status/role changes, invitation acceptance, and ownership transfer. Downstream organization routes still perform fresh membership and permission checks.
- No authenticated page HTML or shared CDN response is cached. Next.js `use cache: remote` is not used because there is no configured remote cache handler/provider and private data needs explicit scope.

## Redis provider and deployment

Upstash Redis REST is the configured adapter target and is a suitable provider for a Vercel/serverless deployment because it uses bounded HTTPS requests rather than keeping a TCP connection alive per function instance. The current local URL/token pair has not authenticated successfully. The adapter uses the Upstash-compatible REST pipeline API and can be pointed at a compatible managed Redis REST service.

Set these server-only variables independently in each environment:

```dotenv
UPSTASH_REDIS_REST_URL=https://<upstash-rest-endpoint>
UPSTASH_REDIS_REST_TOKEN=<server-only-token>
```

Use separate databases/credentials for local development, staging, and production. Do not expose either variable with a `NEXT_PUBLIC_` prefix. Set `REDIS_ENABLED=false` to force database-only mode. If values are absent, requests use the database and in-process request coalescing. The Redis REST client times out after 1.2 seconds, opens a 60-second circuit after HTTP 401/403, and opens a five-second circuit after other provider failures. Cache errors are logged without cache keys, user identifiers, endpoint values, or payloads.

The cache key format is versioned (`michaelos:v1`) and hashes deterministic serialized scope/query data. Cache entries are further namespaced by resource. Tag generations make invalidation independent of wildcard deletion. Maximum entry TTL is one hour; callers should choose short TTLs for frequently changing data.

## Performance interpretation and limits

No before/after authenticated browser benchmark can be reported from this workspace: no disposable browser session or test identity is configured, and Redis authentication has not succeeded to produce distributed cache hits. The test suite verifies server cache key scope, cache hit/miss, request coalescing, bypass, tag invalidation, and fail-open behavior through a deterministic in-memory backend. This is correctness verification, not a Redis or latency benchmark.

The current `.env.local` has both Upstash variable names, but a live authenticated `PING` returned HTTP 401. The adapter therefore falls back to PostgreSQL after the authentication failure and suppresses repeated provider attempts during a 60-second circuit window. The supplied endpoint/token pair must be checked in Upstash and must belong to the same Redis database before live caching can be verified. The values were not printed or changed.

Work task lists and capacity summaries are not persistently cached yet. Their responses contain computed permissions and scope-sensitive data; they should only be cached after authorization is resolved on every request and all task, assignment, team/project membership, policy, and member-availability mutations have proven invalidation coverage. Existing Prisma pagination and SQL workload aggregation remain in place. Redis outages do not affect database writes or normal read behavior.

The first query-client adoption is intentionally limited to summary data. The query-key factory provides distinct user/organization keys for future migration, but task lists, calendar ranges, team/project lists, and optimistic mutations remain on their existing fetch flows until each mutation's invalidation behavior is migrated and tested.

## Local verification

```bash
npm run test:cache
npx tsc --noEmit
npm run lint
```

The cache metrics are process-local diagnostics, not a production distributed hit ratio. They are not exposed through a public API. A deployment-wide metrics backend should be added only alongside the hosting provider's existing observability system.
