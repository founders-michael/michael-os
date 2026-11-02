BEGIN;

ALTER TABLE "OrganizationInvitation"
  ADD COLUMN "declinedAt" TIMESTAMPTZ(3),
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "OrganizationInvitation"
  ALTER COLUMN "updatedAt" DROP DEFAULT;

DROP INDEX "OrganizationInvitation_one_pending_per_org_email_key";

CREATE UNIQUE INDEX "OrganizationInvitation_one_pending_per_org_email_key"
  ON "OrganizationInvitation"("organizationId", "email")
  WHERE "acceptedAt" IS NULL
    AND "revokedAt" IS NULL
    AND "declinedAt" IS NULL;

COMMIT;
