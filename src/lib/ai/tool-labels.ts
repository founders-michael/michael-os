/**
 * How each assistant tool is described to the user.
 *
 * Three phrasings per tool, because three places show tool activity:
 *  - `label`  — the source name in a finished reply ("Based on: Your tasks");
 *  - `doing`  — the live progress line while it runs ("Reading your tasks");
 *  - `detail` — the expandable explanation of what the tool can see.
 *
 * Every `detail` restates what the tool's declaration in `tools.ts` actually
 * does, in user terms; none claims more. In particular, the draft and planning
 * tools say plainly that nothing is saved until the user acts, which is true:
 * Michael has no write tool.
 *
 * `tool-labels.test.ts` reads `tools.ts` and fails if a tool is declared there
 * without an entry here, so a new tool cannot silently surface as the generic
 * fallback.
 */

export type ToolKind = "read" | "draft" | "plan";

export type ToolLabel = {
  label: string;
  doing: string;
  detail: string;
  kind: ToolKind;
};

export const TOOL_LABELS: Record<string, ToolLabel> = {
  get_my_tasks: { kind: "read", label: "Your tasks", doing: "Reading your tasks", detail: "A page of your saved tasks — titles, status, due dates and priority." },
  get_my_goals: { kind: "read", label: "Your goals", doing: "Reading your goals", detail: "Your goals and how many of their milestones are complete." },
  get_my_context: { kind: "read", label: "Your context", doing: "Reading what you told Michael", detail: "What you wrote about yourself in Settings → My Context, and the name you want Michael to use." },
  get_my_habits: { kind: "read", label: "Your habits", doing: "Reading your habits", detail: "Your active habits and their recent completion streaks." },
  get_my_calendar: { kind: "read", label: "Your calendar and availability", doing: "Checking your calendar", detail: "Your calendar and availability, in your timezone, for up to 14 days." },
  get_daily_overview: { kind: "read", label: "Your daily overview", doing: "Looking over your day", detail: "Your whole day: routine, today's schedule, each task, goal and habit, and what's done." },
  get_daily_review: { kind: "read", label: "Your Daily Review", doing: "Reviewing your day", detail: "What you planned and completed on one date, and whether time tracking was available." },
  get_project_delivery_risk: { kind: "read", label: "Project delivery risk", doing: "Reading project delivery risk", detail: "The already-calculated risk score, its inputs and the delivery forecast for one project." },
  get_project_execution_metrics: { kind: "read", label: "Project execution metrics", doing: "Reading project metrics", detail: "Already-calculated completion metrics for one project and its milestones." },
  get_task_dependency_analysis: { kind: "read", label: "Task dependency analysis", doing: "Tracing task dependencies", detail: "Why one work task is blocked, its dependency chain and what it holds up." },
  get_organization_overview: { kind: "read", label: "Organization overview", doing: "Reading the organization overview", detail: "Summary details of this organization." },
  get_organization_members: { kind: "read", label: "Organization directory", doing: "Reading the organization directory", detail: "The organization directory, only when your role allows it." },
  prepare_schedule_proposal: { kind: "plan", label: "Draft schedule", doing: "Preparing a schedule draft", detail: "Asked the planner for a schedule draft. Nothing is added to your calendar until you approve sessions." },
  draft_task: { kind: "draft", label: "Draft task", doing: "Drafting a task", detail: "Prepared an unsaved task. Nothing is saved until you press Save." },
  draft_goal: { kind: "draft", label: "Draft goal", doing: "Drafting a goal", detail: "Prepared an unsaved goal. Nothing is saved until you press Save." },
  draft_habit: { kind: "draft", label: "Draft habit", doing: "Drafting a habit", detail: "Prepared an unsaved habit. Nothing is saved until you press Save." },
  draft_calendar_event: { kind: "draft", label: "Draft calendar event", doing: "Drafting a calendar event", detail: "Prepared an unsaved calendar event. Nothing is saved until you press Save." },
};

const UNKNOWN_TOOL: ToolLabel = {
  kind: "read",
  label: "Information request",
  doing: "Checking your information",
  detail: "Information Michael requested to answer this question.",
};

export function toolLabel(name: string): ToolLabel {
  return TOOL_LABELS[name] ?? UNKNOWN_TOOL;
}
