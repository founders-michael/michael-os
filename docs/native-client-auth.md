# Native client authentication

The iOS and Android apps sign in through the same Better Auth instance as the web app. They cannot keep a cookie jar the way a browser does, so they use a bearer token.

## How it works

- `src/lib/auth.ts` enables Better Auth's `bearer` plugin with `requireSignature: true`.
- A successful `POST /api/auth/sign-in/email` (or social sign-in) returns the signed session token in the `set-auth-token` response header. Sign-up returns none: the email must be verified first.
- The client sends `Authorization: Bearer <token>` on every request. The plugin turns it into the session a cookie would have produced, so `auth.api.getSession({ headers })` and every route resolver work unchanged. No route knows which kind of client called it.
- `POST /api/auth/sign-out` with the token revokes that session only.
- The token is the session. It lives in the Keychain or Keystore-backed storage on the device and is never logged.

## Origin and CSRF

Better Auth demands a trusted `Origin` when a request carries a cookie, an `Origin` or `Referer`, or any `Sec-Fetch-*` header. A native HTTP client sends none of these, so it passes without a `trustedOrigins` entry, and no entry should be added for the apps. A browser cannot forge that shape: it always sends Fetch Metadata.

Node's built-in `fetch` adds `Sec-Fetch-Mode`, which is why `scripts/bearer-auth-smoke.ts` uses `node:http` to behave like a real native client.

## Google sign-in from the apps

The native Google SDK returns an ID token whose audience is that platform's OAuth client ID. Set `GOOGLE_IOS_CLIENT_ID` and `GOOGLE_ANDROID_CLIENT_ID` (same Google Cloud project as `GOOGLE_CLIENT_ID`) and the server accepts those audiences. The web client ID stays first in the list because the redirect flow uses the first entry. The existing rules still apply: the provider must report the email verified, and an existing password account is linked only if its own email is verified.

## Tests

`npm run test:bearer-auth` against a running dev server, or as part of `npm run test:authorization`, which uses a disposable local Postgres. It covers token issue, session resolution, refusal of missing, random, unsigned and forged tokens, the entitlement check, cross-user isolation and sign-out.
