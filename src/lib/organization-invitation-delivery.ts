/** Email delivery seam for a future configured provider. No provider is installed today. */
export interface OrganizationInvitationDelivery {
  sendInvitation(input: { email: string; organizationName: string; role: string; acceptUrl: string }): Promise<void>;
}

/** Null means callers must use the explicit development handoff or fail safely. */
export function getOrganizationInvitationDelivery(): OrganizationInvitationDelivery | null {
  return null;
}

export function getApplicationOrigin(): string | null {
  const configuredUrl = process.env.BETTER_AUTH_URL;
  if (!configuredUrl) return null;
  try {
    const base = new URL(configuredUrl);
    if ((base.protocol !== "http:" && base.protocol !== "https:") || base.username || base.password) return null;
    return base.origin;
  } catch {
    return null;
  }
}

export function createInvitationAcceptUrl(token: string): string | null {
  const origin = getApplicationOrigin();
  return origin ? new URL(`/accept-invitation?token=${encodeURIComponent(token)}`, origin).toString() : null;
}
