# P1 caching and performance foundation

## Repository findings

- The project is a Next.js 16 App Router application with Cache Components and Partial Prefetching enabled. No application code currently uses `use cache`, `revalidateTag`, or `unstable_cache`.
- Next.js 16 Route Handlers are uncached by default. Successful responses for resource reads backed by the shared cache explicitly use `private, no-store`; Redis remains an internal service cache and does not enable intermediary caching.
- Upstash Redis REST is configured locally through `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`. Live authenticated verification now passes after the local environment was refreshed. The repository does not identify a production host.
- Page data is loaded through server-rendered props and direct browser `fetch` calls. LifestyleOS task and habit summaries were fetched again from the persistent shell and widgets.

## Cache responsibilities

- The browser uses one TanStack Query client. Resource key factories are product/user scoped; WorkOS keys also include the organization. API fetches remain `no-store`; the browser cache is session memory only. Identity changes/logout clear all queries. Product or organization transitions evict WorkOS queries while retaining the separate LifestyleOS cache. A 401/403 query error evicts the failed entry.
- Server-side Redis is optional. It auto-enables when both Upstash variables are configured, unless `REDIS_ENABLED=false`. WorkOS task, team, project, and capacity reads use service-level cache entries scoped by organization and user; membership, resource visibility, and capacity permission checks run before cache lookup. LifestyleOS task, goal, habit, calendar, and availability reads use per-user cache keys. Versioned tags are invalidated after committed organization access, structure, task, assignment, policy, availability, calendar, and personal-resource mutations. Protected HTTP responses remain private/no-store.
- Resource TTLs are centralized in `src/lib/resource-cache.ts`: organization selector 15s, team/project lists 90s, task lists and resource details 45s, capacity 30s, personal lists 90s, personal summaries 45s, dashboard summaries 15s, calendar 30s, calendar conflicts 10s, and availability 20s.
- No authenticated page HTML or shared CDN response is cached. Next.js `use cache: remote` is not used because there is no configured remote cache handler/provider and private data needs explicit scope.

## Redis provider and deployment

Upstash Redis REST is the configured adapter target and is suitable for serverless deployment because it uses bounded HTTPS requests rather than keeping a TCP connection alive per function instance. The adapter uses the Upstash REST pipeline API.

Set these server-only variables independently in each environment:

```dotenv
UPSTASH_REDIS_REST_URL=https://<upstash-rest-endpoint>
UPSTASH_REDIS_REST_TOKEN=<server-only-token>
```

Use separate databases/credentials for local development, staging, and production. Do not expose either variable with a `NEXT_PUBLIC_` prefix. Set `REDIS_ENABLED=false` to force database-only mode. If values are absent, requests use the database and in-process request coalescing. The Redis REST client times out after 1.2 seconds, opens a 60-second circuit after HTTP 401/403, and opens a five-second circuit after other provider failures. Cache errors are logged without cache keys, user identifiers, endpoint values, or payloads.

The cache key format is versioned (`michaelos:v1`) and hashes deterministic serialized scope/query data. Cache entries are further namespaced by resource. Tag generations make invalidation independent of wildcard deletion. Maximum entry TTL is one hour; callers should choose short TTLs for frequently changing data.

## Performance interpretation and limits

No before/after authenticated browser benchmark or database query-count benchmark is available yet. The prior infrastructure check confirmed authenticated `PING`, temporary SET/GET, TTL expiry, tag-version invalidation, and the application cache wrapper's hit and recompute behavior. Temporary keys were cleaned up; no application records were used. The P1.2 checks verify cache key scope, cache hit/miss, request coalescing, bypass, tag invalidation, resource invalidation coverage, and fail-open behavior through a deterministic in-memory backend. These are correctness checks, not a latency benchmark.

Work task lists and details include permission-sensitive output. Each call resolves the active organization membership and current task visibility before returning a cached result. Capacity summaries re-resolve the current capacity permission, manager scope, relevant team/project scope, policy version, date range, and filters. Task and assignment mutations invalidate task and capacity tags; team, project, organization membership, policy, and availability mutations invalidate affected views. Capacity remains an estimate based on due-date windows; task effort is not distributed across multiple weeks, and unestimated or undated tasks are reported separately.

Redis remains optional. Read, write, and invalidation failures fall back to database-backed computation; short resource-specific TTLs bound staleness if invalidation cannot complete. Authenticated API responses are not publicly cacheable. No database schema change is used for this caching expansion.

## Local verification

```bash
npm run test:cache
npx tsc --noEmit
npm run lint
```

The cache metrics are process-local diagnostics, not a production distributed hit ratio. They are not exposed through a public API. A deployment-wide metrics backend should be added only alongside the hosting provider's existing observability system.

## P1.4 verification (2026-11-10)

An authenticated Upstash REST check used `.env.local` without printing credentials. It verified PING, temporary SET/GET, TTL expiry, a versioned-tag Redis primitive, and cleanup. The versioned-tag check used temporary REST commands; it was not an invocation of the application cache wrapper. A 24-sample Redis primitive probe measured cold-miss GET+SET median 286.67 ms (p95 295.49 ms) and warm-hit GET median 29.00 ms (p95 31.97 ms). These timings include remote REST/network latency and exclude database computation, application serialization, and authorized API work; they do not establish an application-level or page-load improvement. The temporary probe keys were deleted. The configured Redis account could not be independently classified as disposable from repository configuration, so do not rerun write probes until its target is confirmed as development/test.

For a repeatable primitive check, confirm `.env.local` points at a disposable development/test Upstash database, then run:

```bash
P1_CACHE_BENCHMARK_ALLOW_TEMP_KEYS=1 npm run benchmark:cache
```

The script refuses to write unless that explicit opt-in is present, applies short expirations to every test key, and deletes the namespaced keys in a `finally` cleanup. Optional sample count: `P1_CACHE_BENCHMARK_SAMPLES=50` (bounded to 5–100).

Application endpoint and frontend navigation baselines remain unmeasured. The local server returned 401 for `/api/organizations` without an authenticated session, browser automation was unavailable, and no safe disposable database target was verified. Therefore database query counts, authenticated cold/warm endpoint latency, browser request counts, and LCP/INP/CLS are not reported. The existing automated cache tests exercise isolated cache hit/miss, coalescing, invalidation, failure fallback, and tenant/user key isolation; they are correctness tests rather than latency benchmarks. No schema/index optimization was justified by measured query plans, so this phase made no database changes.

## P1.5 application-level reliability validation (2026-11-10)

The application wrapper (`src/lib/server-cache.ts`) and its Redis REST adapter were bundled in memory for a deterministic mocked-fetch exercise. Environment values were test-only; no external Redis or database was contacted. Results: wrapper cold compute/warm hit, TTL expiry, user/organization/filter/page key isolation, multiple-tag invalidation, concurrent identical-miss coalescing, mocked 401 fallback, 60-second breaker open/recovery, mocked timeout fallback, five-second breaker open/recovery, and invalidation-error containment all passed. The timeout was a mocked `TimeoutError`; the real 1.2-second network timeout was not exercised. The wrapper's safe structured logs contained only operation, error category/type, and no request data or credentials. This was an executed local harness, not a committed test suite.

Source inspection confirms WorkOS route handlers resolve the authenticated session and active organization membership before calling services. `listWorkTasks` resolves the actor and visibility scope before `getCached`; `getWorkTask` checks the actor and tenant-scoped task before cache access. LifestyleOS task APIs derive the user from the Better Auth session before calling the user-scoped service. Existing unit tests also pass for tenant/user cache-key isolation, current manager-scope policy, query-context eviction on organization/account changes, and 401/403 query eviction. These are source/unit checks, not live two-tenant API tests. Live membership revocation, role changes, and cross-tenant mutations were not tested because the `.env.local` database target was not positively identified as disposable. No migration status or database mutation was attempted.

P1.5 regression commands passed: `npm run test:cache` (19), `npm run test:organizations:unit` (15), `npm run test:capacity` (11), `npm run test:calendar-contract` (17), `npm run test:ux` (28), `npm run test:ai` (14), `npx prisma validate`, `npx tsc --noEmit`, `npm run lint`, `npm run build`, and `git diff --check`. Build's Prisma generation only rewrote generated client formatting; those generated outputs were restored because they were clean before the build. No schema changes or migrations were made.

Browser automation was unavailable (`CUA_REPL_ENABLED_SURFACES` was not configured). Manual verification when browser access is available: sign in with two disposable test accounts; compare WorkOS organization task responses in DevTools; switch organizations and confirm old organization rows disappear before and after refresh; revoke one test membership from a separate authorized session and retry a protected request; log out and sign in as the other account to confirm LifestyleOS and WorkOS client data are cleared/scoped; then repeat LifestyleOS task/calendar navigation and capture request counts and Web Vitals. Do not use production accounts or records for this verification.

## P1.3 frontend server state

The shared TanStack Query setup is centralized in `src/components/query-provider.tsx` and `src/lib/query-client.ts`. Query keys in `src/lib/query-keys.ts` normalize object input key order and separate LifestyleOS from WorkOS and from users/organizations. Private client requests go through `src/lib/api-query.ts`, which always uses `cache: "no-store"`, supports abort signals, and returns safe status-bearing errors. `src/lib/workspace-summary-queries.ts` defines persistent shell queries for personal task and habit summaries.

TanStack Query now owns/cache-deduplicates the repeated reads for personal task lists/summaries, goals, habits/habit summaries, calendar ranges and unscheduled tasks, organization selector/details/members/invitations, team and project list/detail records, organization work task lists/details, capacity summaries, and member availability/workload. Existing server-rendered props seed their matching initial query entries where the client list begins from server data. Mutations invalidate scoped prefixes after server success; complex capacity aggregates are refetched instead of optimistically reconstructed. Work pages are keyed by organization so a tenant switch remounts their local state as well as evicting prior WorkOS cache entries.

In-memory stale-time defaults are centralized in `src/lib/query-client.ts`: preferences/metadata 5 minutes, team/project lists 90 seconds, task lists/details 45 seconds, capacity 30 seconds, member workload 25 seconds, calendar 45 seconds, and availability 20 seconds. LifestyleOS reads use these user-scoped windows. Protected WorkOS reads explicitly use `staleTime: 0` when loaded so current membership and manager scope are checked on each page/resource load; concurrent identical calls still coalesce, while the response remains in memory for reconciliation and invalidation. Query garbage collection defaults to 5 minutes (stable entries 15 minutes). These policies do not grant authorization; every endpoint continues to authenticate and authorize on every request. Browser/network performance benchmarking has not been performed, so no speedup is claimed.
