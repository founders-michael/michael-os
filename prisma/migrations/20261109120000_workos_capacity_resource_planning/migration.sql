-- AlterTable
ALTER TABLE "OrganizationPolicy" ADD COLUMN     "allowTeamCapacityOverrides" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "capacityDailyEndTime" VARCHAR(5) NOT NULL DEFAULT '17:00',
ADD COLUMN     "capacityDailyStartTime" VARCHAR(5) NOT NULL DEFAULT '09:00',
ADD COLUMN     "capacityTimeZone" VARCHAR(100) NOT NULL DEFAULT 'UTC',
ADD COLUMN     "capacityWeeklyMinutes" INTEGER NOT NULL DEFAULT 2400,
ADD COLUMN     "capacityWorkingDays" INTEGER[] DEFAULT ARRAY[1, 2, 3, 4, 5]::INTEGER[],
ADD COLUMN     "managersCanEditMemberAvailability" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "managersCanManageTeamCapacity" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "membersCanManageOwnAvailability" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "nearCapacityPercent" INTEGER NOT NULL DEFAULT 85,
ADD COLUMN     "overCapacityPercent" INTEGER NOT NULL DEFAULT 100,
ADD COLUMN     "underCapacityPercent" INTEGER NOT NULL DEFAULT 50;

-- CreateTable
CREATE TABLE "TeamCapacityPolicy" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "workingDays" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "dailyStartTime" VARCHAR(5),
    "dailyEndTime" VARCHAR(5),
    "timeZone" VARCHAR(100),
    "weeklyCapacityMinutes" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeamCapacityPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemberAvailability" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workingDays" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "dailyStartTime" VARCHAR(5),
    "dailyEndTime" VARCHAR(5),
    "timeZone" VARCHAR(100),
    "weeklyCapacityMinutes" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MemberAvailability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemberAvailabilityException" (
    "id" TEXT NOT NULL,
    "availabilityId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "startTime" VARCHAR(5),
    "endTime" VARCHAR(5),
    "timeZone" VARCHAR(100) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MemberAvailabilityException_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TeamCapacityPolicy_organizationId_idx" ON "TeamCapacityPolicy"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "TeamCapacityPolicy_teamId_organizationId_key" ON "TeamCapacityPolicy"("teamId", "organizationId");

-- CreateIndex
CREATE INDEX "MemberAvailability_organizationId_timeZone_idx" ON "MemberAvailability"("organizationId", "timeZone");

-- CreateIndex
CREATE UNIQUE INDEX "MemberAvailability_organizationId_userId_key" ON "MemberAvailability"("organizationId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "MemberAvailability_id_organizationId_userId_key" ON "MemberAvailability"("id", "organizationId", "userId");

-- CreateIndex
CREATE INDEX "MemberAvailabilityException_organizationId_userId_startDate_idx" ON "MemberAvailabilityException"("organizationId", "userId", "startDate", "endDate");

-- AddForeignKey
ALTER TABLE "TeamCapacityPolicy" ADD CONSTRAINT "TeamCapacityPolicy_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamCapacityPolicy" ADD CONSTRAINT "TeamCapacityPolicy_teamId_organizationId_fkey" FOREIGN KEY ("teamId", "organizationId") REFERENCES "Team"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberAvailability" ADD CONSTRAINT "MemberAvailability_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberAvailability" ADD CONSTRAINT "MemberAvailability_organizationId_userId_fkey" FOREIGN KEY ("organizationId", "userId") REFERENCES "OrganizationMembership"("organizationId", "userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberAvailabilityException" ADD CONSTRAINT "MemberAvailabilityException_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberAvailabilityException" ADD CONSTRAINT "MemberAvailabilityException_availabilityId_organizationId__fkey" FOREIGN KEY ("availabilityId", "organizationId", "userId") REFERENCES "MemberAvailability"("id", "organizationId", "userId") ON DELETE CASCADE ON UPDATE CASCADE;

