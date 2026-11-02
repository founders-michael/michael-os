export function safeInvitationReturnTo(value: string | undefined) {
  if (!value) return undefined;
  try {
    const url = new URL(value, "https://michaelos.invalid");
    if (url.origin !== "https://michaelos.invalid" || url.pathname !== "/accept-invitation") return undefined;
    const token = url.searchParams.get("token");
    if (!token || token.length < 40 || token.length > 128) return undefined;
    return `/accept-invitation?token=${encodeURIComponent(token)}`;
  } catch { return undefined; }
}
