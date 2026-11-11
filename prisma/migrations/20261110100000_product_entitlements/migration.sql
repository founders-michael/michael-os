-- Add explicit, user-level entitlements for the independent products.
CREATE TYPE "ProductPermission" AS ENUM ('LIFESTYLE_OS_ACCESS', 'WORK_OS_ACCESS');

CREATE TABLE "UserProductPermission" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "permission" "ProductPermission" NOT NULL,
    "grantedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "grantedBy" TEXT,

    CONSTRAINT "UserProductPermission_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserProductPermission_userId_permission_key"
    ON "UserProductPermission"("userId", "permission");
CREATE INDEX "UserProductPermission_permission_userId_idx"
    ON "UserProductPermission"("permission", "userId");

ALTER TABLE "UserProductPermission"
    ADD CONSTRAINT "UserProductPermission_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserProductPermission"
    ADD CONSTRAINT "UserProductPermission_grantedBy_fkey"
    FOREIGN KEY ("grantedBy") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Existing identities retain LifestyleOS access. Existing WorkOS access is
-- preserved only for users with an active membership in an initialized org;
-- pending invitations and inactive memberships grant nothing.
INSERT INTO "UserProductPermission" ("id", "userId", "permission", "grantedAt")
SELECT 'product_lifestyle_' || md5(u."id"), u."id", 'LIFESTYLE_OS_ACCESS'::"ProductPermission", CURRENT_TIMESTAMP
FROM "user" u
ON CONFLICT ("userId", "permission") DO NOTHING;

INSERT INTO "UserProductPermission" ("id", "userId", "permission", "grantedAt")
SELECT DISTINCT 'product_work_' || md5(m."userId"), m."userId", 'WORK_OS_ACCESS'::"ProductPermission", CURRENT_TIMESTAMP
FROM "OrganizationMembership" m
JOIN "Organization" o ON o."id" = m."organizationId"
JOIN "OrganizationPolicy" p ON p."organizationId" = o."id"
WHERE m."status" = 'ACTIVE'
ON CONFLICT ("userId", "permission") DO NOTHING;
