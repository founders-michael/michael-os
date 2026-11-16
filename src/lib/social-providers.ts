/**
 * Which social sign-in providers are switched on, read from the environment.
 *
 * A provider is enabled only when both its client id and secret are set, so a
 * half-configured provider never renders a button that fails at the callback.
 * Pure (it takes the env as an argument) so the rule is unit-tested; `auth.ts`
 * builds Better Auth's `socialProviders` from it and the auth pages read the
 * same list to decide which buttons to show.
 */

export const SOCIAL_PROVIDERS = ["google", "github"] as const;
export type SocialProvider = (typeof SOCIAL_PROVIDERS)[number];

export const SOCIAL_PROVIDER_LABELS: Record<SocialProvider, string> = { google: "Google", github: "GitHub" };

const ENV_NAMES: Record<SocialProvider, { id: string; secret: string }> = {
  google: { id: "GOOGLE_CLIENT_ID", secret: "GOOGLE_CLIENT_SECRET" },
  github: { id: "GITHUB_CLIENT_ID", secret: "GITHUB_CLIENT_SECRET" },
};

export type SocialProviderCredentials = { clientId: string; clientSecret: string };

export function socialProviderCredentials(env: Record<string, string | undefined>) {
  const configured: Partial<Record<SocialProvider, SocialProviderCredentials>> = {};
  for (const provider of SOCIAL_PROVIDERS) {
    const clientId = env[ENV_NAMES[provider].id]?.trim();
    const clientSecret = env[ENV_NAMES[provider].secret]?.trim();
    if (clientId && clientSecret) configured[provider] = { clientId, clientSecret };
  }
  return configured;
}

export function enabledSocialProviders(env: Record<string, string | undefined>): SocialProvider[] {
  const configured = socialProviderCredentials(env);
  return SOCIAL_PROVIDERS.filter((provider) => configured[provider]);
}
