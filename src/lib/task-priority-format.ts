/**
 * Turns the intelligence service's ranking (reason codes and numbers) into the
 * words a person reads. Pure and tested: the Tasks screens show these lines on
 * page load, so they come from rules over the returned components, never from
 * a model (CLAUDE.md §7, "computed by tested rules"). Labels and weights come
 * from the one published file, shared/intelligence/prioritization.json.
 */
import { z } from "zod";
import prioritizationFile from "../../shared/intelligence/prioritization.json";

const reason = z.object({ code: z.string().max(40) }).catchall(z.union([z.string().max(40), z.number(), z.null()]));
const component = z.object({
  name: z.string().max(40),
  applicable: z.boolean(),
  value: z.number().min(0).max(1).nullable(),
  weight: z.number().min(0).max(1),
  contribution: z.number().nullable(),
  reason,
}).strict();
const rankedItem = z.object({
  rank: z.number().int().positive(),
  ref: z.string().max(40),
  score: z.number().min(0).max(100),
  actionable: z.boolean(),
  blockedReason: reason.nullable(),
  components: z.array(component).max(12),
}).strict();
export const prioritizationResponseSchema = z.object({
  schemaVersion: z.literal(1),
  modelVersion: z.string().max(40),
  asOfDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  weights: z.record(z.string(), z.number()),
  ranked: z.array(rankedItem).max(200),
}).strict();

export type PriorityComponent = z.infer<typeof component>;
export type RankedPriority = z.infer<typeof rankedItem>;
export type PrioritizationResponse = z.infer<typeof prioritizationResponseSchema>;

export const PRIORITIZATION_MODEL_VERSION = prioritizationFile.modelVersion;
const LABELS: Record<string, string> = Object.fromEntries(prioritizationFile.components.map(({ name, label }) => [name, label]));

export function componentLabel(name: string) {
  return LABELS[name] ?? name;
}

function plural(count: number, one: string, many = `${one}s`) {
  return `${count} ${count === 1 ? one : many}`;
}

function inDays(days: number) {
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  return days < 0 ? `${plural(-days, "day")} ago` : `in ${plural(days, "day")}`;
}

/** One component's reason as a short phrase; `null` when it says nothing worth showing. */
export function describeReason(item: Pick<PriorityComponent, "reason">): string | null {
  const r = item.reason;
  const n = (key: string) => (typeof r[key] === "number" ? (r[key] as number) : 0);
  switch (r.code) {
    case "PRIORITY": return `${String(r.priority).charAt(0).toUpperCase()}${String(r.priority).slice(1)} priority`;
    case "OVERDUE": return `Overdue by ${plural(n("days"), "day")}`;
    case "DUE_TODAY": return "Due today";
    case "DUE_IN": return `Due ${inDays(n("days"))}`;
    case "NO_DUE_DATE": return "No due date";
    case "SUPPORTS_GOALS": {
      const goals = n("count") === 1 ? "Supports a goal" : `Supports ${plural(n("count"), "goal")}`;
      return typeof r.nearestTargetInDays === "number" ? `${goals} with a target ${inDays(r.nearestTargetInDays)}` : goals;
    }
    case "IN_PROJECT": return `In a ${String(r.projectPriority)}-priority project${typeof r.targetInDays === "number" ? ` due ${inDays(r.targetInDays)}` : ""}`;
    case "NOT_ALIGNED": return r.product === "work" ? "Not in an active project" : "Not linked to a goal";
    case "BLOCKS_TASKS": return `${plural(n("count"), "open task")} ${n("count") === 1 ? "waits" : "wait"} on this`;
    case "BLOCKS_NOTHING": return "Nothing waits on this";
    case "EFFORT_VS_TIME": return `About ${plural(n("minutes"), "minute")} of work with ${plural(n("daysLeft"), "day")} left`;
    case "NO_ESTIMATE": return "No time estimate";
    case "POSTPONED": return `Postponed ${n("count") === 1 ? "once" : `${n("count")} times`}`;
    case "NEVER_POSTPONED": return "Never postponed";
    case "WAITING_ON_BLOCKERS": return `Waiting on ${plural(n("count"), "unfinished task")}`;
    case "STATUS_BLOCKED": return "Marked blocked";
    default: return null;
  }
}

/**
 * The two reasons that lifted this task most, for a one-line "why". A blocked
 * task leads with what it is waiting on, since that is why it sits low.
 */
export function priorityWhy(item: RankedPriority): string {
  const top = item.components
    .filter((c) => c.applicable && (c.contribution ?? 0) > 0)
    .sort((left, right) => (right.contribution ?? 0) - (left.contribution ?? 0))
    .slice(0, 2)
    .map(describeReason)
    .filter((text): text is string => Boolean(text));
  const blocked = item.blockedReason ? describeReason({ reason: item.blockedReason }) : null;
  return [blocked, ...top].filter(Boolean).join(" · ") || "No strong signal yet";
}

/** Every component in published order, for the "how this was scored" detail and for Michael's tool result. */
export function priorityBreakdown(item: RankedPriority) {
  return item.components.map((c) => ({
    component: componentLabel(c.name),
    applies: c.applicable,
    reason: describeReason(c) ?? (c.applicable ? "" : "Does not apply"),
    weightPercent: Math.round(c.weight * 100),
    points: c.contribution,
  }));
}
