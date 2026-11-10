import assert from "node:assert/strict";
import test from "node:test";
import { capacityOverviewQuerySchema, memberAvailabilityExceptionCreateSchema, organizationCapacityPolicyUpdateSchema } from "@/lib/capacity-validation";

test("capacity query validates real dates and bounded pagination", () => {
  assert.equal(capacityOverviewQuerySchema.safeParse({ from: "2026-02-31", page: "1", limit: "25" }).success, false);
  assert.equal(capacityOverviewQuerySchema.safeParse({ from: "2026-11-09", to: "2026-11-08", page: "1", limit: "25" }).success, false);
  assert.equal(capacityOverviewQuerySchema.safeParse({ page: "1", limit: "101" }).success, false);
  assert.deepEqual(capacityOverviewQuerySchema.parse({ page: "2", limit: "25", status: "OVER_CAPACITY", memberId: "member-a", sort: "remainingMinutes", sortDirection: "asc" }), {
    page: 2, limit: 25, status: "OVER_CAPACITY", search: "", sort: "remainingMinutes", sortDirection: "asc", memberId: "member-a",
  });
});

test("organization workload thresholds must be ordered", () => {
  assert.equal(organizationCapacityPolicyUpdateSchema.safeParse({ underCapacityPercent: 60, nearCapacityPercent: 60 }).success, false);
  assert.equal(organizationCapacityPolicyUpdateSchema.safeParse({ nearCapacityPercent: 90, overCapacityPercent: 90 }).success, false);
  assert.equal(organizationCapacityPolicyUpdateSchema.safeParse({ underCapacityPercent: 50, nearCapacityPercent: 85, overCapacityPercent: 100 }).success, true);
});

test("availability exceptions require complete same-day intervals or full-day dates", () => {
  const base = { startDate: "2026-11-09", endDate: "2026-11-09", timeZone: "Asia/Kolkata" };
  assert.equal(memberAvailabilityExceptionCreateSchema.safeParse({ ...base }).success, true);
  assert.equal(memberAvailabilityExceptionCreateSchema.safeParse({ ...base, startTime: "09:00" }).success, false);
  assert.equal(memberAvailabilityExceptionCreateSchema.safeParse({ ...base, startTime: "13:00", endTime: "12:00" }).success, false);
  assert.equal(memberAvailabilityExceptionCreateSchema.safeParse({ ...base, endDate: "2026-11-10", startTime: "09:00", endTime: "12:00" }).success, false);
  assert.equal(memberAvailabilityExceptionCreateSchema.safeParse({ ...base, timeZone: "Mars/Olympus" }).success, false);
});
