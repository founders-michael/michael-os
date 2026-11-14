import "server-only";

import { headers } from "next/headers";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { getProfileForUser } from "@/lib/profile-service";
import { getTaskDashboardData, listTasks } from "@/lib/task-service";
import { getGoalDashboardData, listGoals } from "@/lib/goal-service";
import { getHabitDashboardData, listHabits } from "@/lib/habit-service";
import { getAvailability, listCalendarEvents } from "@/lib/calendar-service";
import { calendarRange, localDateAt, shiftLocalDate } from "@/lib/calendar-date";
import { requireOrganizationPermission } from "@/lib/organization-authorization";
import { hasOrganizationPermission } from "@/lib/organization-permissions";
import { getOrganization, listOrganizationMembers } from "@/lib/organization-service";
import { toolResultWithClientPayload, type AIJsonSchema, type AIAgentContext, type AIToolDeclaration } from "@/lib/ai/types";
import { createPlanProposal } from "@/lib/planning-service";
import { getDailyReviewData } from "@/lib/daily-review-service";
import { getProjectDeliveryRisk } from "@/lib/delivery-risk-service";
import { getProjectExecutionMetrics } from "@/lib/execution-metrics-service";
import { getTaskDependencyAnalysis } from "@/lib/dependency-analysis-service";
import { dailyReviewDateSchema } from "@/lib/daily-review-validation";
import { hasProductPermission } from "@/lib/product-authorization";
import { buildDraft, type DraftKind } from "@/lib/ai/draft-model";

const emptySchema: AIJsonSchema = { type: "object", properties: {}, additionalProperties: false };
const taskInput = z.object({ view: z.enum(["pending", "overdue", "completed", "all"]).optional() }).strict();
const goalInput = z.object({ status: z.enum(["ACTIVE", "COMPLETED", "ARCHIVED"]).optional() }).strict();
const habitInput = z.object({}).strict();
const calendarInput = z.object({ fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), toDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }).strict();
const planningInput = z.object({ fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), toDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).strict();
const reviewInput = z.object({ reviewDate: dailyReviewDateSchema.optional() }).strict();
// Draft tool inputs are deliberately permissive about completeness: the model
// passes whatever the user actually said, and the server decides what is still
// missing. They are strict about shape so an unknown field is a tool error
// rather than a silently dropped value.
const draftTaskInput = z.object({
  title: z.string().trim().max(400).optional(),
  description: z.string().trim().max(5000).optional(),
  priority: z.string().trim().max(40).optional(),
  dueDate: z.string().trim().max(40).optional(),
  estimatedDurationMinutes: z.union([z.number(), z.string().trim().max(20)]).optional(),
}).strict();
const draftGoalInput = z.object({
  title: z.string().trim().max(400).optional(),
  description: z.string().trim().max(5000).optional(),
  category: z.string().trim().max(200).optional(),
  targetDate: z.string().trim().max(40).optional(),
  progress: z.union([z.number(), z.string().trim().max(20)]).optional(),
}).strict();
const draftHabitInput = z.object({
  title: z.string().trim().max(400).optional(),
  description: z.string().trim().max(2000).optional(),
  frequency: z.string().trim().max(40).optional(),
  weekdays: z.array(z.union([z.number(), z.string().trim().max(10)])).max(14).optional(),
}).strict();
const draftEventInput = z.object({
  title: z.string().trim().max(400).optional(),
  description: z.string().trim().max(5000).optional(),
  eventType: z.string().trim().max(40).optional(),
  date: z.string().trim().max(40).optional(),
  startTime: z.string().trim().max(20).optional(),
  endTime: z.string().trim().max(20).optional(),
}).strict();
// Resource identifiers only. Organization and user identity never appear here;
// they come from server-resolved context.
const projectScopedInput = z.object({ projectId: z.string().trim().min(1).max(128) }).strict();
const taskScopedInput = z.object({ taskId: z.string().trim().min(1).max(128) }).strict();

const declarations: Record<string, AIToolDeclaration> = {
  get_my_tasks: {
    name: "get_my_tasks", description: "Read the authenticated user's own task list. Returns a small page of tasks.",
    parameters: { type: "object", properties: { view: { type: "string", enum: ["pending", "overdue", "completed", "all"] } }, additionalProperties: false },
  },
  get_my_goals: {
    name: "get_my_goals", description: "Read the authenticated user's own goals and milestone counts.",
    parameters: { type: "object", properties: { status: { type: "string", enum: ["ACTIVE", "COMPLETED", "ARCHIVED"] } }, additionalProperties: false },
  },
  get_my_habits: { name: "get_my_habits", description: "Read active habits and recent streak/completion summaries belonging to the authenticated user.", parameters: emptySchema },
  get_my_calendar: {
    name: "get_my_calendar", description: "Read the user's calendar and availability in the user's timezone. Defaults to today and the next 6 days. The range is limited to 14 days.",
    parameters: { type: "object", properties: { fromDate: { type: "string", description: "Optional local date YYYY-MM-DD" }, toDate: { type: "string", description: "Optional inclusive local date YYYY-MM-DD" } }, additionalProperties: false },
  },
  get_daily_overview: { name: "get_daily_overview", description: "Summarize the authenticated user's own tasks, goals, habits, and today's calendar.", parameters: emptySchema },
  get_daily_review: { name: "get_daily_review", description: "Read a date-specific LifestyleOS review for the authenticated user, including distinct planned/completed tasks, status cycles, schedule history, and transparent time-tracking availability. Use this for Daily Review requests. Never change tasks based on this data.", parameters: { type: "object", properties: { reviewDate: { type: "string", description: "Optional local date YYYY-MM-DD. Defaults to today in the user's timezone." } }, additionalProperties: false } },
  get_project_delivery_risk: {
    name: "get_project_delivery_risk",
    description: "Read the computed delivery risk score, every weighted input behind it, and the throughput forecast for one project in the authorized organization. All figures are already calculated; report them exactly as given and never recompute, combine or estimate any number. Organization identity is selected and authorized by the server, not a tool argument.",
    parameters: { type: "object", properties: { projectId: { type: "string", description: "The project to read risk for, within the already-authorized organization." } }, required: ["projectId"], additionalProperties: false },
  },
  get_project_execution_metrics: {
    name: "get_project_execution_metrics",
    description: "Read completion metrics for one project and each of its milestones, including completion by task count and by estimate with estimate coverage. Figures are already calculated; never recompute or re-derive them.",
    parameters: { type: "object", properties: { projectId: { type: "string", description: "The project to read metrics for, within the already-authorized organization." } }, required: ["projectId"], additionalProperties: false },
  },
  get_task_dependency_analysis: {
    name: "get_task_dependency_analysis",
    description: "Read why one work task is blocked: its unmet blockers, longest dependency chain, critical path and downstream impact. A blocker the caller may not see is counted but reported without identity. Figures are already calculated; never recompute them.",
    parameters: { type: "object", properties: { taskId: { type: "string", description: "The work task to analyse, within the already-authorized organization." } }, required: ["taskId"], additionalProperties: false },
  },
  get_organization_overview: { name: "get_organization_overview", description: "Read safe summary details for the currently authorized WorkOS organization. Organization identity is selected and authorized by the server, not a tool argument.", parameters: emptySchema },
  get_organization_members: { name: "get_organization_members", description: "List organization directory details only when the authenticated user's current organization permission allows it.", parameters: emptySchema },
  draft_task: {
    name: "draft_task",
    description: "Prepare an unsaved task for the user to review and save. This does NOT save anything and creates no record. Pass only details the user actually gave; omit anything they did not say rather than inventing it. The reply tells you which required details are still missing so you can ask for them. After calling this, tell the user the draft is below and that they must press Save.",
    parameters: { type: "object", properties: { title: { type: "string", description: "What the task is, in the user's own words" }, description: { type: "string", description: "Extra notes the user gave" }, priority: { type: "string", enum: ["LOW", "MEDIUM", "HIGH"], description: "Only if the user indicated urgency" }, dueDate: { type: "string", description: "Local date YYYY-MM-DD, only if the user gave a date" }, estimatedDurationMinutes: { type: "number", description: "Whole minutes, 5 to 1440, only if the user said how long" } }, additionalProperties: false },
  },
  draft_goal: {
    name: "draft_goal",
    description: "Prepare an unsaved goal for the user to review and save. This does NOT save anything and creates no record. Pass only details the user actually gave. The reply names any required detail still missing. After calling this, tell the user the draft is below and that they must press Save.",
    parameters: { type: "object", properties: { title: { type: "string", description: "What the user wants to achieve" }, description: { type: "string" }, category: { type: "string", description: "Only if the user named an area such as health or career" }, targetDate: { type: "string", description: "Local date YYYY-MM-DD, only if the user gave one" }, progress: { type: "number", description: "Percent 0 to 100, only if the user said they have already started" } }, additionalProperties: false },
  },
  draft_habit: {
    name: "draft_habit",
    description: "Prepare an unsaved habit for the user to review and save. This does NOT save anything and creates no record. Use frequency DAILY for every day, or SELECTED_DAYS with weekdays as ISO numbers where 1 is Monday and 7 is Sunday. Pass only what the user gave. After calling this, tell the user the draft is below and that they must press Save.",
    parameters: { type: "object", properties: { title: { type: "string", description: "The habit the user wants to build" }, description: { type: "string" }, frequency: { type: "string", enum: ["DAILY", "SELECTED_DAYS"] }, weekdays: { type: "array", items: { type: "number" }, description: "ISO weekdays 1-7, required only when frequency is SELECTED_DAYS" } }, additionalProperties: false },
  },
  draft_calendar_event: {
    name: "draft_calendar_event",
    description: "Prepare an unsaved calendar event for the user to review and save. This does NOT save anything, does NOT change the calendar and creates no record. Give the local date and local start and end times; the user's timezone is applied by the server. Use COMMITMENT for something the user is doing and UNAVAILABLE for time they are not available. To schedule existing tasks across several days, use prepare_schedule_proposal instead. After calling this, tell the user the draft is below and that they must press Save.",
    parameters: { type: "object", properties: { title: { type: "string", description: "What the event is" }, description: { type: "string" }, eventType: { type: "string", enum: ["COMMITMENT", "UNAVAILABLE"] }, date: { type: "string", description: "Local date YYYY-MM-DD" }, startTime: { type: "string", description: "Local start time HH:mm, 24-hour" }, endTime: { type: "string", description: "Local end time HH:mm, 24-hour, after the start time" } }, additionalProperties: false },
  },
  prepare_schedule_proposal: {
    name: "prepare_schedule_proposal",
    description: "Ask the existing deterministic planner to prepare a reviewable schedule draft for a requested local date range. This does not change the calendar; the user must explicitly approve selected sessions.",
    parameters: { type: "object", properties: { fromDate: { type: "string", description: "First local date, YYYY-MM-DD, today or later" }, toDate: { type: "string", description: "Last local date, YYYY-MM-DD; up to 7 dates total" } }, required: ["fromDate", "toDate"], additionalProperties: false },
  },
};

type ToolContext = AIAgentContext & { now?: Date };
type ToolDefinition = {
  declaration: AIToolDeclaration;
  schema: z.ZodType;
  execute: (context: ToolContext, input: unknown) => Promise<unknown>;
};

async function verifyLifestyleContext(userId: string) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || session.user.id !== userId) throw new Error("TOOL_FORBIDDEN");
  if (!(await hasProductPermission(userId, "LIFESTYLE_OS_ACCESS"))) throw new Error("TOOL_FORBIDDEN");
  const profile = await getProfileForUser(userId);
  if (!profile?.onboardingCompleted) throw new Error("TOOL_FORBIDDEN");
  return profile;
}

const lifestyleTools: ToolDefinition[] = [
  {
    declaration: declarations.get_my_tasks!, schema: taskInput,
    execute: async (context, raw) => {
      const profile = await verifyLifestyleContext(context.userId);
      const args = taskInput.parse(raw);
      const data = await listTasks(context.userId, profile.timeZone, { view: args.view ?? "pending", sort: "dueDate", page: 1, limit: 12 });
      return { timeZone: profile.timeZone, tasks: data.tasks.map(({ title, description, status, priority, dueDate, remainingDurationMinutes, estimatedDurationMinutes }) => ({ title, description, status, priority, dueDate, remainingDurationMinutes, estimatedDurationMinutes })) };
    },
  },
  {
    declaration: declarations.get_my_goals!, schema: goalInput,
    execute: async (context, raw) => {
      await verifyLifestyleContext(context.userId);
      const args = goalInput.parse(raw);
      const data = await listGoals(context.userId, { status: args.status, sort: "targetDate" });
      return { goals: data.goals.slice(0, 12).map(({ title, description, category, status, progress, targetDate, milestoneCount, completedMilestoneCount }) => ({ title, description, category, status, progress, targetDate, milestoneCount, completedMilestoneCount })) };
    },
  },
  {
    declaration: declarations.get_my_habits!, schema: habitInput,
    execute: async (context, raw) => {
      await verifyLifestyleContext(context.userId);
      habitInput.parse(raw);
      const { habits } = await listHabits(context.userId, context.timeZone ?? "Asia/Kolkata", { status: "ACTIVE" });
      return { habits: habits.slice(0, 12).map(({ title, description, frequency, weekdays, todayScheduled, completedToday, currentStreak, bestStreak, completionPercentage, eligibleDays, completedDays }) => ({ title, description, frequency, weekdays, todayScheduled, completedToday, currentStreak, bestStreak, completionPercentage, eligibleDays, completedDays })) };
    },
  },
  {
    declaration: declarations.get_my_calendar!, schema: calendarInput,
    execute: async (context, raw) => {
      const profile = await verifyLifestyleContext(context.userId);
      const args = calendarInput.parse(raw);
      if ((args.fromDate && !args.toDate) || (!args.fromDate && args.toDate)) throw new Error("TOOL_INVALID_ARGUMENTS");
      const fromDate = args.fromDate ?? localDateAt(profile.timeZone, context.now ?? new Date());
      const toDate = args.toDate ?? shiftLocalDate(fromDate, 6);
      if (fromDate > toDate || (Date.parse(`${toDate}T00:00:00Z`) - Date.parse(`${fromDate}T00:00:00Z`)) / 86_400_000 > 13) throw new Error("TOOL_INVALID_ARGUMENTS");
      const range = calendarRange(fromDate, "day", profile.timeZone);
      const endRange = calendarRange(shiftLocalDate(toDate, 1), "day", profile.timeZone);
      const [calendar, availability] = await Promise.all([
        listCalendarEvents(context.userId, range.from, endRange.from),
        getAvailability(context.userId),
      ]);
      return {
        timeZone: profile.timeZone, fromDate, toDate,
        events: calendar.events.slice(0, 100).map(({ title, description, eventType, schedulingMode, startAt, endAt, timeZone, taskTitle }) => ({ title, description, eventType, schedulingMode, startAt, endAt, timeZone, taskTitle })),
        truncated: calendar.truncated || calendar.events.length > 100,
        availability: { configured: availability.configured, windows: availability.windows.slice(0, 50).map(({ weekday, startTime, endTime, timeZone, active }) => ({ weekday, startTime, endTime, timeZone, active })) },
      };
    },
  },
  {
    declaration: declarations.get_daily_overview!, schema: habitInput,
    execute: async (context, raw) => {
      const profile = await verifyLifestyleContext(context.userId);
      habitInput.parse(raw);
      const today = localDateAt(profile.timeZone, context.now ?? new Date());
      const dayRange = calendarRange(today, "day", profile.timeZone);
      const [taskData, goalData, habitData, calendar] = await Promise.all([
        getTaskDashboardData(context.userId, profile.timeZone, today),
        getGoalDashboardData(context.userId, profile.timeZone),
        getHabitDashboardData(context.userId, profile.timeZone),
        listCalendarEvents(context.userId, dayRange.from, dayRange.to),
      ]);
      return {
        localDate: today, timeZone: profile.timeZone,
        tasks: taskData.summary,
        goals: goalData.summary,
        habits: habitData.summary,
        calendar: calendar.events.slice(0, 40).map(({ title, eventType, startAt, endAt, timeZone, taskTitle }) => ({ title, eventType, startAt, endAt, timeZone, taskTitle })),
      };
    },
  },
  {
    declaration: declarations.get_daily_review!, schema: reviewInput,
    execute: async (context, raw) => {
      const profile = await verifyLifestyleContext(context.userId);
      const args = reviewInput.parse(raw);
      const reviewDate = args.reviewDate ?? localDateAt(profile.timeZone, context.now ?? new Date());
      const review = await getDailyReviewData(context.userId, profile.timeZone, reviewDate);
      return {
        date: review.date,
        timeZone: review.timeZone,
        overview: review.overview,
        plannedTasks: review.plannedTasks.slice(0, 30).map(({ task, statusAtSelectedDate, dueDateAtSelectedDate, plannedIntervals }) => ({ title: task.title, description: task.description, priority: task.priority, status: statusAtSelectedDate, dueDate: dueDateAtSelectedDate, plannedSessions: plannedIntervals.map(({ startAt, endAt }) => ({ startAt, endAt })) })),
        completedCycles: review.completedTasks.slice(0, 40).map(({ task, completedAt }) => ({ title: task.title, completedAt })),
        unfinishedTasks: review.missedTasks.slice(0, 30).map(({ task, statusAtSelectedDate, overdueAtSelectedDate, intentionallySkipped }) => ({ title: task.title, status: statusAtSelectedDate, overdue: overdueAtSelectedDate, intentionallySkipped })),
        time: review.time,
        weekly: { planned: review.weekly.planned, completed: review.weekly.completed, completionPercent: review.weekly.completionPercent, incomplete: review.weekly.incomplete, rescheduled: review.weekly.rescheduled, consistencyDays: review.weekly.consistencyDays, actualTrackedMinutes: review.weekly.actualTrackedMinutes },
      };
    },
  },
  // Draft tools. These re-verify session identity and the LifestyleOS
  // entitlement like every other tool, but deliberately perform no write and
  // call no domain service: they return an unsaved proposal only. The write
  // happens when the user presses Save in the chat, which posts the reviewed
  // form to the same endpoint the Tasks/Goals/Habits/Calendar screens use,
  // under the user's own session. No route accepts a model-authored payload.
  ...([
    ["task", "draft_task", draftTaskInput],
    ["goal", "draft_goal", draftGoalInput],
    ["habit", "draft_habit", draftHabitInput],
    ["calendarEvent", "draft_calendar_event", draftEventInput],
  ] as const).map(([kind, toolName, schema]): ToolDefinition => ({
    declaration: declarations[toolName]!, schema,
    execute: async (context, raw) => {
      const profile = await verifyLifestyleContext(context.userId);
      const proposed = schema.parse(raw) as Record<string, unknown>;
      const draft = buildDraft(kind as DraftKind, proposed, profile.timeZone);
      // The model is told only what it must still ask for. The field values go
      // to the client as a payload so the model cannot restate them as saved,
      // and `saved: false` is repeated here because that is the fact it most
      // reliably gets wrong.
      return toolResultWithClientPayload({
        saved: false,
        kind: draft.kind,
        draftPresentedToUser: true,
        missingRequiredDetails: draft.missing,
        readyToSave: draft.ready,
        nextStep: draft.ready
          ? "The draft is shown to the user with a Save button. Tell them to review it and press Save. Do not say it is saved."
          : `Ask the user for: ${draft.missing.join(", ")}. The draft is shown but cannot be saved until these are filled.`,
      }, draft);
    },
  })),
  {
    declaration: declarations.prepare_schedule_proposal!, schema: planningInput,
    execute: async (context, raw) => {
      const profile = await verifyLifestyleContext(context.userId);
      const { fromDate, toDate } = planningInput.parse(raw);
      const proposal = await createPlanProposal(context.userId, fromDate, toDate);
      const tasksById = new Map(proposal.taskDetails.map((task) => [task.id, task]));
      const modelResult = {
        status: proposal.solverStatus,
        timeZone: profile.timeZone,
        horizon: proposal.horizon,
        summary: proposal.summary,
        sessions: proposal.proposedActivities.map((item) => ({ task: tasksById.get(item.taskId)?.title ?? "Task", startAt: item.startAt, endAt: item.endAt, durationMinutes: item.durationMinutes })),
        unscheduled: proposal.unscheduledTasks.map((item) => ({ task: tasksById.get(item.taskId)?.title ?? "Task", reason: item.reason })),
        warnings: proposal.warnings.map(({ code, message }) => ({ code, message })),
      };
      // Keep the signed approval capability and internal task/session IDs out of model context.
      return toolResultWithClientPayload(modelResult, proposal);
    },
  },
];

export async function getAITools(context: ToolContext): Promise<ToolDefinition[]> {
  if (context.product === "lifestyle") return lifestyleTools;
  if (!context.organizationId) throw new Error("TOOL_FORBIDDEN");
  const { membership, managerScope } = await requireOrganizationPermission(context.organizationId, "organization.read");
  const organizationTools: ToolDefinition[] = [{
    declaration: declarations.get_organization_overview!, schema: habitInput,
    execute: async () => {
      const authorized = await requireOrganizationPermission(context.organizationId!, "organization.read");
      const organization = await getOrganization(context.organizationId!, authorized.membership.id);
      return {
        name: organization.name,
        slug: organization.slug,
        policy: organization.policy,
        membership: { role: organization.membership.role, status: organization.membership.status },
      };
    },
  }];
  if (hasOrganizationPermission(membership.role, managerScope, "members.list")) organizationTools.push({
    declaration: declarations.get_organization_members!, schema: habitInput,
    execute: async () => {
      await requireOrganizationPermission(context.organizationId!, "members.list");
      return { members: (await listOrganizationMembers(context.organizationId!)).slice(0, 100).map(({ name, email, role, status, joinedAt }) => ({ name, email, role, status, joinedAt })) };
    },
  });
  // W7 execution intelligence. Each re-verifies session identity and WorkOS
  // entitlement through requireOrganizationPermission, takes the organization
  // from server context, calls a domain service rather than prisma, and does no
  // arithmetic of its own: the service's numbers are returned unchanged.
  organizationTools.push({
    declaration: declarations.get_project_delivery_risk!, schema: projectScopedInput,
    execute: async (toolContext, raw) => {
      const authorized = await requireOrganizationPermission(toolContext.organizationId!, "projects.list");
      const { projectId } = projectScopedInput.parse(raw);
      return getProjectDeliveryRisk(toolContext.organizationId!, projectId, authorized.user.id);
    },
  });
  organizationTools.push({
    declaration: declarations.get_project_execution_metrics!, schema: projectScopedInput,
    execute: async (toolContext, raw) => {
      const authorized = await requireOrganizationPermission(toolContext.organizationId!, "projects.list");
      const { projectId } = projectScopedInput.parse(raw);
      return getProjectExecutionMetrics(toolContext.organizationId!, projectId, authorized.user.id);
    },
  });
  organizationTools.push({
    declaration: declarations.get_task_dependency_analysis!, schema: taskScopedInput,
    execute: async (toolContext, raw) => {
      const authorized = await requireOrganizationPermission(toolContext.organizationId!, "workTasks.list");
      const { taskId } = taskScopedInput.parse(raw);
      return getTaskDependencyAnalysis(toolContext.organizationId!, taskId, authorized.user.id);
    },
  });
  return organizationTools;
}

export async function executeAITool(context: ToolContext, tool: ToolDefinition, input: unknown) {
  const parsed = tool.schema.safeParse(input);
  if (!parsed.success) throw new Error("TOOL_INVALID_ARGUMENTS");
  return tool.execute(context, parsed.data);
}

