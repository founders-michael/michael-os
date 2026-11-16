/**
 * Social sign-in against a running dev server, up to the provider hand-off.
 *
 * A real Google or GitHub consent screen cannot be driven from a script, so
 * this checks everything on our side of it: each enabled provider starts a
 * flow that points at the provider with our callback URL and a state cookie;
 * a disabled provider is refused; a callback URL on another origin is refused
 * (no open redirect); and a forged callback with no valid state returns to
 * the error URL instead of creating a session. Works with placeholder
 * credentials, so it can run without real OAuth apps.
 */
import dotenv from "dotenv";
import { enabledSocialProviders, SOCIAL_PROVIDERS } from "../src/lib/social-providers";

dotenv.config({ path: ".env.local" });
const base = process.env.SMOKE_BASE_URL ?? process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
const enabled = (process.env.SMOKE_SOCIAL_PROVIDERS?.split(",").filter(Boolean) ?? enabledSocialProviders(process.env)) as string[];
const headers = { "content-type": "application/json", origin: base };
const AUTHORIZE_HOSTS: Record<string, string> = { google: "accounts.google.com", github: "github.com" };
function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
const start = (body: unknown) => fetch(`${base}/api/auth/sign-in/social`, { method: "POST", headers, body: JSON.stringify(body) });

assert(enabled.length > 0, "No social provider is enabled; set credentials or SMOKE_SOCIAL_PROVIDERS.");
for (const provider of SOCIAL_PROVIDERS) {
  const response = await start({ provider, callbackURL: "/lifestyle/login", errorCallbackURL: "/lifestyle/login" });
  if (!enabled.includes(provider)) {
    assert(!response.ok, `Disabled provider ${provider} started a sign-in.`);
    continue;
  }
  assert(response.ok, `Starting ${provider} sign-in failed (${response.status}).`);
  const { url } = await response.json() as { url?: string };
  assert(url, `${provider} sign-in returned no authorization URL.`);
  const authorize = new URL(url);
  assert(authorize.hostname === AUTHORIZE_HOSTS[provider], `${provider} pointed at ${authorize.hostname}.`);
  assert(authorize.searchParams.get("redirect_uri") === `${base}/api/auth/callback/${provider}`, `${provider} redirect_uri was ${authorize.searchParams.get("redirect_uri")}.`);
  assert(authorize.searchParams.get("state"), `${provider} sign-in carried no state.`);
  assert(response.headers.getSetCookie().some((cookie) => cookie.includes("state")), `${provider} sign-in set no state cookie.`);

  const foreign = await start({ provider, callbackURL: "https://attacker.example/steal" });
  assert(foreign.status === 403, `A foreign callbackURL for ${provider} returned ${foreign.status}, expected 403.`);

  const forged = await fetch(`${base}/api/auth/callback/${provider}?code=forged&state=forged`, { redirect: "manual" });
  assert(forged.status >= 300 && forged.status < 400, `Forged ${provider} callback returned ${forged.status}, expected a redirect.`);
  assert(!forged.headers.getSetCookie().some((cookie) => cookie.startsWith("better-auth.session_token=") && !cookie.startsWith("better-auth.session_token=;")), `Forged ${provider} callback issued a session.`);
  assert(forged.headers.get("location")?.includes("error="), `Forged ${provider} callback redirected without an error.`);
}
console.log(`Social sign-in smoke checks passed for: ${enabled.join(", ")}.`);
