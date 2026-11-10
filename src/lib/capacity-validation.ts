import { z } from "zod";

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  try { return new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value; }
  catch { return false; }
}, "Use a valid calendar date.");

const timeOfDay = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, "Use 24-hour time, such as 09:00.");
const timeZone = z.string().trim().min(1).max(100).refine((value) => {
  try { new Intl.DateTimeFormat("en", { timeZone: value }); return true; }
  catch { return false; }
}, "Choose a valid IANA timezone.");
const workingDays = z.array(z.number().int().min(1).max(7)).min(1).max(7)
  .refine((days) => new Set(days).size === days.length, "Choose each weekday only once.");
const weeklyMinutes = z.number().int().min(60).max(10_080);
const optionalNullableTime = timeOfDay.nullable().optional();
const optionalNullableZone = timeZone.nullable().optional();

function nonEmptyPatch<T extends z.ZodRawShape>(shape: T) {
  return z.object(shape).strict().refine((value) => Object.keys(value).length > 0, "Make at least one change.");
}

export const organizationCapacityPolicyUpdateSchema = nonEmptyPatch({
  capacityWorkingDays: workingDays.optional(),
  capacityDailyStartTime: timeOfDay.optional(),
  capacityDailyEndTime: timeOfDay.optional(),
  capacityTimeZone: timeZone.optional(),
  capacityWeeklyMinutes: weeklyMinutes.optional(),
  underCapacityPercent: z.number().int().min(1).max(100).optional(),
  nearCapacityPercent: z.number().int().min(50).max(300).optional(),
  overCapacityPercent: z.number().int().min(50).max(400).optional(),
  allowTeamCapacityOverrides: z.boolean().optional(),
  managersCanManageTeamCapacity: z.boolean().optional(),
  managersCanEditMemberAvailability: z.boolean().optional(),
  membersCanManageOwnAvailability: z.boolean().optional(),
}).refine((value) => value.capacityDailyStartTime === undefined || value.capacityDailyEndTime === undefined || value.capacityDailyStartTime < value.capacityDailyEndTime, {
  path: ["capacityDailyEndTime"], message: "The workday must end after it starts.",
}).refine((value) => value.nearCapacityPercent === undefined || value.overCapacityPercent === undefined || value.overCapacityPercent > value.nearCapacityPercent, {
  path: ["overCapacityPercent"], message: "Over-capacity must be higher than near-capacity.",
}).refine((value) => value.underCapacityPercent === undefined || value.nearCapacityPercent === undefined || value.nearCapacityPercent > value.underCapacityPercent, {
  path: ["nearCapacityPercent"], message: "Near-capacity must be higher than underutilized.",
});

const overrideFields = {
  workingDays: z.array(z.number().int().min(1).max(7)).max(7).refine((days) => new Set(days).size === days.length, "Choose each weekday only once.").optional(),
  dailyStartTime: optionalNullableTime,
  dailyEndTime: optionalNullableTime,
  timeZone: optionalNullableZone,
  weeklyCapacityMinutes: weeklyMinutes.nullable().optional(),
};

export const capacityOverrideUpdateSchema = nonEmptyPatch(overrideFields).refine((value) => {
  return value.dailyStartTime === undefined || value.dailyStartTime === null || value.dailyEndTime === undefined || value.dailyEndTime === null || value.dailyStartTime < value.dailyEndTime;
}, { path: ["dailyEndTime"], message: "The workday must end after it starts." });

export const memberAvailabilityExceptionCreateSchema = z.object({
  startDate: dateOnly,
  endDate: dateOnly,
  startTime: timeOfDay.optional(),
  endTime: timeOfDay.optional(),
  timeZone,
}).strict().refine((value) => value.endDate >= value.startDate, {
  path: ["endDate"], message: "The end date must be on or after the start date.",
}).refine((value) => (value.startTime === undefined) === (value.endTime === undefined), {
  path: ["endTime"], message: "Provide both times for a partial-day exception, or neither for full days.",
}).refine((value) => value.startTime === undefined || value.startDate === value.endDate, {
  path: ["endDate"], message: "Partial-day exceptions must be on a single local date.",
}).refine((value) => value.startTime === undefined || value.startTime < value.endTime!, {
  path: ["endTime"], message: "The unavailable period must end after it starts.",
});

export const capacityOverviewQuerySchema = z.object({
  from: dateOnly.optional(),
  to: dateOnly.optional(),
  teamId: z.string().trim().min(1).max(128).optional(),
  memberId: z.string().trim().min(1).max(128).optional(),
  search: z.string().trim().max(120).default(""),
  status: z.enum(["ALL", "UNDERUTILIZED", "HEALTHY", "NEAR_CAPACITY", "OVER_CAPACITY", "UNCONFIGURED"]).default("ALL"),
  sort: z.enum(["name", "availableMinutes", "assignedMinutes", "remainingMinutes", "utilizationPercent", "status"]).default("assignedMinutes"),
  sortDirection: z.enum(["asc", "desc"]).default("desc"),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
}).strict().refine((value) => !value.from || !value.to || value.to >= value.from, {
  path: ["to"], message: "The end date must be on or after the start date.",
});

export type OrganizationCapacityPolicyUpdate = z.infer<typeof organizationCapacityPolicyUpdateSchema>;
export type CapacityOverrideUpdate = z.infer<typeof capacityOverrideUpdateSchema>;
export type MemberAvailabilityExceptionCreate = z.infer<typeof memberAvailabilityExceptionCreateSchema>;
export type CapacityOverviewQuery = z.infer<typeof capacityOverviewQuerySchema>;
