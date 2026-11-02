export type OrganizationInvitationStatus = "PENDING" | "ACCEPTED" | "REVOKED" | "EXPIRED";

export function organizationInvitationStatus(
  invitation: { acceptedAt: Date | null; revokedAt: Date | null; declinedAt: Date | null; expiresAt: Date },
  now = new Date(),
): OrganizationInvitationStatus {
  if (invitation.acceptedAt) return "ACCEPTED";
  if (invitation.declinedAt) return "REVOKED";
  if (invitation.expiresAt <= now) return "EXPIRED";
  if (invitation.revokedAt) return "REVOKED";
  return "PENDING";
}
