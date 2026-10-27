import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

const TOKEN_LIFETIME_MS = 15 * 60 * 1000;
const instant = z.string().datetime({ offset: true });
const timeZone = z.string().min(1).max(100).refine((value) => {
  try { new Intl.DateTimeFormat("en", { timeZone: value }); return true; }
  catch { return false; }
}, "Invalid IANA timezone.");

const activitySchema = z.object({
  selectionId: z.string().uuid(),
  existingEventId: z.null(),
  taskId: z.string().min(1).max(128),
  startAt: instant,
  endAt: instant,
  timeZone,
  durationMinutes: z.number().int().positive().max(1440),
  sessionIndex: z.number().int().positive().max(100),
  sessionCount: z.number().int().positive().max(100),
}).strict().refine((activity) => {
  const start = Date.parse(activity.startAt);
  const end = Date.parse(activity.endAt);
  const startDate = new Date(start);
  const endDate = new Date(end);
  return end > start && end - start === activity.durationMinutes * 60_000 && activity.sessionIndex <= activity.sessionCount &&
    startDate.getUTCSeconds() === 0 && startDate.getUTCMilliseconds() === 0 && endDate.getUTCSeconds() === 0 && endDate.getUTCMilliseconds() === 0 && startDate.getUTCMinutes() % 15 === 0;
}, "Invalid proposed activity interval.");

const localDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
});
const taskVersionSchema = z.object({ updatedAt: instant, status: z.enum(["TODO", "IN_PROGRESS"]), durationMinutes: z.number().int().positive().max(1440), dueDate: localDate.nullable() }).strict();
const availabilityVersionSchema = z.object({ updatedAt: instant, weekday: z.number().int().min(1).max(7), startTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/), endTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/), timeZone }).strict().refine((window) => window.startTime < window.endTime);
const tokenPayloadSchema = z.object({
  version: z.literal(1),
  userId: z.string().min(1).max(128),
  expiresAt: z.number().int().positive(),
  timeZone,
  horizon: z.object({ from: instant, to: instant }).strict(),
  activities: z.array(activitySchema).max(500),
  taskVersions: z.record(z.string().min(1).max(128), taskVersionSchema),
  availabilityVersions: z.record(z.string().min(1).max(128), availabilityVersionSchema),
}).strict().superRefine((payload, context) => {
  const from = Date.parse(payload.horizon.from);
  const to = Date.parse(payload.horizon.to);
  if (from >= to) context.addIssue({ code: "custom", path: ["horizon"], message: "Invalid planning horizon." });

  const selections = new Set<string>();
  const byTask = new Map<string, typeof payload.activities>();
  for (const [index, activity] of payload.activities.entries()) {
    if (selections.has(activity.selectionId)) context.addIssue({ code: "custom", path: ["activities", index, "selectionId"], message: "Duplicate session identifier." });
    selections.add(activity.selectionId);
    if (activity.timeZone !== payload.timeZone) context.addIssue({ code: "custom", path: ["activities", index, "timeZone"], message: "Session timezone mismatch." });
    if (Date.parse(activity.startAt) < from || Date.parse(activity.endAt) > to) context.addIssue({ code: "custom", path: ["activities", index], message: "Session is outside the planning horizon." });
    if (!payload.taskVersions[activity.taskId]) context.addIssue({ code: "custom", path: ["activities", index, "taskId"], message: "Session task is not in the proposal." });
    byTask.set(activity.taskId, [...(byTask.get(activity.taskId) ?? []), activity]);
  }

  for (const [index, activity] of payload.activities.entries()) {
    for (let otherIndex = index + 1; otherIndex < payload.activities.length; otherIndex++) {
      const other = payload.activities[otherIndex]!;
      if (Date.parse(activity.startAt) < Date.parse(other.endAt) && Date.parse(activity.endAt) > Date.parse(other.startAt)) {
        context.addIssue({ code: "custom", path: ["activities", otherIndex], message: "Proposed sessions overlap." });
      }
    }
  }

  for (const [taskId, activities] of byTask) {
    const expected = payload.taskVersions[taskId]!.durationMinutes;
    const duration = activities.reduce((sum, activity) => sum + activity.durationMinutes, 0);
    const count = activities[0]!.sessionCount;
    const indices = activities.map((activity) => activity.sessionIndex).sort((a, b) => a - b);
    if (duration !== expected || activities.some((activity) => activity.sessionCount !== count) || count !== activities.length || indices.some((value, index) => value !== index + 1)) {
      context.addIssue({ code: "custom", path: ["activities"], message: "Task sessions do not match the signed task duration." });
    }
  }
});

export type PlanningApprovalPayload = z.infer<typeof tokenPayloadSchema>;

function signingKey() {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret || secret.length < 32) throw new Error("PLANNING_APPROVAL_NOT_CONFIGURED");
  // Derive a purpose-specific key so planning tokens do not reuse the auth key directly.
  return createHmac("sha256", secret).update("michaelos:calendar-planning-approval:v1").digest();
}

function signature(encoded: string) {
  return createHmac("sha256", signingKey()).update(encoded).digest("base64url");
}

/** Server-only helper. Never import this module from a client component. */
export function issuePlanningApprovalToken(payload: PlanningApprovalPayload) {
  const validated = tokenPayloadSchema.parse(payload);
  const encoded = Buffer.from(JSON.stringify(validated)).toString("base64url");
  return `${encoded}.${signature(encoded)}`;
}

/** Testable clock parameter; production callers should omit it. */
export function verifyPlanningApprovalToken(token: string, userId: string, now = Date.now()): PlanningApprovalPayload | null {
  if (token.length > 100_000 || !Number.isSafeInteger(now)) return null;
  const [encoded, suppliedSignature, extra] = token.split(".");
  if (!encoded || !suppliedSignature || extra || !/^[A-Za-z0-9_-]+$/.test(encoded) || !/^[A-Za-z0-9_-]{43}$/.test(suppliedSignature)) return null;

  let expectedSignature: string;
  try { expectedSignature = signature(encoded); }
  catch { return null; }
  const supplied = Buffer.from(suppliedSignature);
  const expected = Buffer.from(expectedSignature);
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return null;

  try {
    const bytes = Buffer.from(encoded, "base64url");
    if (bytes.toString("base64url") !== encoded) return null;
    const parsed = tokenPayloadSchema.safeParse(JSON.parse(bytes.toString("utf8")) as unknown);
    if (!parsed.success) return null;
    const payload = parsed.data;
    if (payload.userId !== userId || payload.expiresAt <= now || payload.expiresAt > now + TOKEN_LIFETIME_MS) return null;
    return payload;
  } catch { return null; }
}
