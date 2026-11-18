/**
 * Record drafts: the shape Michael proposes and the user confirms.
 *
 * This module is pure and shared by the draft tools and the chat form, so the
 * fields the model may fill and the fields the form renders cannot drift apart.
 * It performs no database access and holds no authorization: a draft is an
 * unsaved suggestion until the user presses Save, at which point the chat posts
 * it to the same endpoint the corresponding screen uses, as the user.
 */

import { localDateTimeToIso } from "@/lib/calendar-date";
import { MEMORY_SENSITIVITIES, MEMORY_SENSITIVITY_LABELS, MEMORY_TEXT_MAX } from "@/lib/memory-validation";

export type DraftKind = "task" | "goal" | "habit" | "calendarEvent" | "memory" | "organizationMemory";

/**
 * Stands in for the organization in a WorkOS endpoint. The draft travels to the
 * intelligence engine, which must never see an organization id (§10.3), so the
 * chat fills it in from its own page context when the user presses Save.
 */
export const ORGANIZATION_PLACEHOLDER = ":organizationId";

export type DraftFieldSpec =
  | { name: string; label: string; type: "text"; required: boolean; maxLength: number; placeholder?: string }
  | { name: string; label: string; type: "textarea"; required: boolean; maxLength: number }
  | { name: string; label: string; type: "select"; required: boolean; options: Array<{ value: string; label: string }> }
  | { name: string; label: string; type: "date"; required: boolean }
  | { name: string; label: string; type: "time"; required: boolean }
  | { name: string; label: string; type: "number"; required: boolean; min: number; max: number; unit?: string }
  | { name: string; label: string; type: "weekdays"; required: boolean };

/** The endpoint the Save button posts to — the one the screen itself uses. */
export const DRAFT_ENDPOINTS: Record<DraftKind, string> = {
  task: "/api/tasks",
  goal: "/api/goals",
  habit: "/api/habits",
  calendarEvent: "/api/calendar/events",
  memory: "/api/memories",
  organizationMemory: `/api/organizations/${ORGANIZATION_PLACEHOLDER}/memories`,
};

/** Where the saved record becomes visible, for the link shown after saving. */
export const DRAFT_DESTINATIONS: Record<DraftKind, { href: string; label: string }> = {
  task: { href: "/tasks", label: "Tasks" },
  goal: { href: "/goals", label: "Goals" },
  habit: { href: "/habits", label: "Habits" },
  calendarEvent: { href: "/calendar", label: "Calendar" },
  memory: { href: "/settings/context", label: "My Context" },
  organizationMemory: { href: `/work/${ORGANIZATION_PLACEHOLDER}/settings`, label: "Organization settings" },
};

export const DRAFT_LABELS: Record<DraftKind, string> = {
  task: "task",
  goal: "goal",
  habit: "habit",
  calendarEvent: "calendar event",
  memory: "memory",
  organizationMemory: "organization memory",
};

const PRIORITY_OPTIONS = [
  { value: "LOW", label: "Low" },
  { value: "MEDIUM", label: "Medium" },
  { value: "HIGH", label: "High" },
];

const SENSITIVITY_OPTIONS = MEMORY_SENSITIVITIES.map((value) => ({ value, label: MEMORY_SENSITIVITY_LABELS[value].label }));

/** Both memory drafts share one shape; they differ only in owner and endpoint. */
const MEMORY_FIELDS: DraftFieldSpec[] = [
  { name: "content", label: "Remember", type: "textarea", required: true, maxLength: MEMORY_TEXT_MAX },
  { name: "sensitivity", label: "Privacy", type: "select", required: true, options: SENSITIVITY_OPTIONS },
  { name: "keepUntil", label: "Keep until", type: "date", required: false },
];

const EVENT_TYPE_OPTIONS = [
  { value: "COMMITMENT", label: "Commitment" },
  { value: "UNAVAILABLE", label: "Unavailable" },
];

/**
 * Field specs mirror the create schemas in task/goal/habit/calendar-validation.
 * `required` here means "required to save", which is why it matches the Zod
 * schema's own required set rather than a judgement about what is useful.
 */
export const DRAFT_FIELDS: Record<DraftKind, DraftFieldSpec[]> = {
  task: [
    { name: "title", label: "Title", type: "text", required: true, maxLength: 160, placeholder: "What needs doing?" },
    { name: "description", label: "Notes", type: "textarea", required: false, maxLength: 5000 },
    { name: "priority", label: "Priority", type: "select", required: true, options: PRIORITY_OPTIONS },
    { name: "dueDate", label: "Due date", type: "date", required: false },
    { name: "estimatedDurationMinutes", label: "Estimate", type: "number", required: false, min: 5, max: 1440, unit: "minutes" },
  ],
  goal: [
    { name: "title", label: "Title", type: "text", required: true, maxLength: 160, placeholder: "What do you want to achieve?" },
    { name: "description", label: "Notes", type: "textarea", required: false, maxLength: 5000 },
    { name: "category", label: "Category", type: "text", required: false, maxLength: 80 },
    { name: "targetDate", label: "Target date", type: "date", required: false },
    { name: "progress", label: "Progress", type: "number", required: false, min: 0, max: 100, unit: "%" },
  ],
  habit: [
    { name: "title", label: "Habit", type: "text", required: true, maxLength: 160, placeholder: "What habit do you want to build?" },
    { name: "description", label: "Notes", type: "textarea", required: false, maxLength: 2000 },
    {
      name: "frequency", label: "Frequency", type: "select", required: true,
      options: [{ value: "DAILY", label: "Every day" }, { value: "SELECTED_DAYS", label: "Selected days" }],
    },
    { name: "weekdays", label: "Days", type: "weekdays", required: false },
    { name: "startTime", label: "Starts", type: "time", required: false },
    { name: "endTime", label: "Ends", type: "time", required: false },
  ],
  calendarEvent: [
    { name: "title", label: "Title", type: "text", required: true, maxLength: 160, placeholder: "What is the event?" },
    { name: "description", label: "Notes", type: "textarea", required: false, maxLength: 5000 },
    { name: "eventType", label: "Type", type: "select", required: true, options: EVENT_TYPE_OPTIONS },
    { name: "date", label: "Date", type: "date", required: true },
    { name: "startTime", label: "Starts", type: "time", required: true },
    { name: "endTime", label: "Ends", type: "time", required: true },
  ],
  memory: MEMORY_FIELDS,
  organizationMemory: MEMORY_FIELDS,
};

/** Defaults the create schemas themselves apply, so the form opens consistent with them. */
export const DRAFT_DEFAULTS: Record<DraftKind, Record<string, unknown>> = {
  task: { priority: "MEDIUM" },
  goal: { progress: 0 },
  habit: { frequency: "DAILY", weekdays: [] },
  calendarEvent: { eventType: "COMMITMENT" },
  memory: { sensitivity: "STANDARD" },
  organizationMemory: { sensitivity: "STANDARD" },
};

export type DraftValues = Record<string, unknown>;

export type RecordDraft = {
  payloadKind: "record-draft";
  kind: DraftKind;
  values: DraftValues;
  /** Required fields still empty. Computed from the specs, never asserted by the model. */
  missing: string[];
  /** True when nothing required is missing. The server recomputes this on save. */
  ready: boolean;
  endpoint: string;
  timeZone: string;
};

function isBlank(value: unknown) {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

export function fieldsFor(kind: DraftKind, values: DraftValues): DraftFieldSpec[] {
  const specs = DRAFT_FIELDS[kind];
  // A daily habit does not use weekdays at all; habitCreateSchema rejects them,
  // so the field is withheld rather than shown and ignored.
  if (kind === "habit" && values.frequency !== "SELECTED_DAYS") {
    return specs.filter((spec) => spec.name !== "weekdays");
  }
  return specs;
}

/** Required-and-empty fields, plus the conditional requirements the schemas add. */
export function missingRequiredFields(kind: DraftKind, values: DraftValues): string[] {
  const missing = fieldsFor(kind, values)
    .filter((spec) => spec.required && isBlank(values[spec.name]))
    .map((spec) => spec.name);
  // habitCreateSchema: SELECTED_DAYS requires at least one weekday.
  if (kind === "habit" && values.frequency === "SELECTED_DAYS" && isBlank(values.weekdays)) {
    missing.push("weekdays");
  }
  return missing;
}

function normalizeValue(spec: DraftFieldSpec, raw: unknown): unknown {
  if (raw === null || raw === undefined) return undefined;
  switch (spec.type) {
    case "text":
    case "textarea": {
      if (typeof raw !== "string") return undefined;
      const trimmed = raw.trim().slice(0, spec.maxLength);
      return trimmed.length > 0 ? trimmed : undefined;
    }
    case "select": {
      // An unrecognized option is dropped, not coerced: a model guessing
      // "URGENT" must leave the field empty so the user chooses, rather than
      // silently becoming whichever option happens to sort first.
      if (typeof raw !== "string") return undefined;
      const match = spec.options.find((option) => option.value === raw.trim().toUpperCase());
      return match?.value;
    }
    case "date":
      return typeof raw === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.trim()) ? raw.trim() : undefined;
    case "time": {
      if (typeof raw !== "string") return undefined;
      const match = /^(\d{1,2}):(\d{2})$/.exec(raw.trim());
      if (!match) return undefined;
      const hours = Number(match[1]);
      const minutes = Number(match[2]);
      if (hours > 23 || minutes > 59) return undefined;
      return `${String(hours).padStart(2, "0")}:${match[2]}`;
    }
    case "number": {
      const parsed = typeof raw === "number" ? raw : Number(String(raw).trim());
      if (!Number.isFinite(parsed)) return undefined;
      const rounded = Math.round(parsed);
      // Out of range is dropped rather than clamped: clamping a model's
      // invented "8 hours" to 1440 would present a number nobody chose.
      return rounded >= spec.min && rounded <= spec.max ? rounded : undefined;
    }
    case "weekdays": {
      if (!Array.isArray(raw)) return undefined;
      const days = [...new Set(raw.map((day) => Math.round(Number(day))).filter((day) => Number.isInteger(day) && day >= 1 && day <= 7))];
      return days.length > 0 ? days.sort((a, b) => a - b) : undefined;
    }
    default:
      return undefined;
  }
}

/**
 * Builds a draft from whatever the model extracted. Unknown keys are discarded
 * and every value is normalized against its spec, so the form never renders a
 * value the create schema would reject.
 */
export function buildDraft(kind: DraftKind, proposed: DraftValues, timeZone: string): RecordDraft {
  const values: DraftValues = { ...DRAFT_DEFAULTS[kind] };
  for (const spec of DRAFT_FIELDS[kind]) {
    const normalized = normalizeValue(spec, proposed[spec.name]);
    if (normalized !== undefined) values[spec.name] = normalized;
  }
  // Re-apply the conditional shape after normalization: a habit that ended up
  // DAILY must carry no weekdays, or habitCreateSchema rejects the save.
  if (kind === "habit" && values.frequency !== "SELECTED_DAYS") values.weekdays = [];

  const missing = missingRequiredFields(kind, values);
  return {
    payloadKind: "record-draft",
    kind,
    values,
    missing,
    ready: missing.length === 0,
    endpoint: DRAFT_ENDPOINTS[kind],
    timeZone,
  };
}

/** The endpoint or link with the page's organization in place of the placeholder; null if it needs one and has none. */
export function resolveDraftPath(path: string, organizationId?: string): string | null {
  if (!path.includes(ORGANIZATION_PLACEHOLDER)) return path;
  return organizationId ? path.replace(ORGANIZATION_PLACEHOLDER, encodeURIComponent(organizationId)) : null;
}

export function isRecordDraft(value: unknown): value is RecordDraft {
  return typeof value === "object" && value !== null
    && (value as { payloadKind?: unknown }).payloadKind === "record-draft";
}

/**
 * The exact create body for the draft's endpoint. The calendar form collects a
 * local date and two local times, because that is what a person knows; the
 * instants the API requires are derived here with the user's timezone.
 *
 * Returns null when the draft is not ready, so a half-filled draft cannot be
 * posted. The endpoint's own Zod schema remains the authority either way.
 */
export function draftRequestBody(draft: RecordDraft): Record<string, unknown> | null {
  if (missingRequiredFields(draft.kind, draft.values).length > 0) return null;
  const values = draft.values;
  const optional = (name: string) => (isBlank(values[name]) ? undefined : values[name]);

  switch (draft.kind) {
    case "task":
      return {
        title: values.title,
        priority: values.priority,
        ...(optional("description") !== undefined ? { description: values.description } : {}),
        ...(optional("dueDate") !== undefined ? { dueDate: values.dueDate } : {}),
        ...(optional("estimatedDurationMinutes") !== undefined ? { estimatedDurationMinutes: values.estimatedDurationMinutes } : {}),
      };
    case "goal":
      return {
        title: values.title,
        progress: typeof values.progress === "number" ? values.progress : 0,
        ...(optional("description") !== undefined ? { description: values.description } : {}),
        ...(optional("category") !== undefined ? { category: values.category } : {}),
        ...(optional("targetDate") !== undefined ? { targetDate: values.targetDate } : {}),
      };
    case "habit":
      return {
        title: values.title,
        frequency: values.frequency,
        weekdays: values.frequency === "SELECTED_DAYS" ? values.weekdays : [],
        // An end time is only valid with a start time (habitCreateSchema).
        ...(optional("startTime") !== undefined ? { startTime: values.startTime, ...(optional("endTime") !== undefined && values.endTime !== values.startTime ? { endTime: values.endTime } : {}) } : {}),
        ...(optional("description") !== undefined ? { description: values.description } : {}),
      };
    case "memory":
    case "organizationMemory":
      return {
        content: values.content,
        sensitivity: values.sensitivity,
        keepUntil: optional("keepUntil") !== undefined ? values.keepUntil : null,
      };
    case "calendarEvent": {
      const startAt = localDateTimeToIso(String(values.date), String(values.startTime), draft.timeZone);
      const endAt = localDateTimeToIso(String(values.date), String(values.endTime), draft.timeZone);
      // calendarEventCreateSchema requires end after start, and only a
      // TASK_SESSION may be FLEXIBLE; a chat-created event is always FIXED.
      if (Date.parse(startAt) >= Date.parse(endAt)) return null;
      return {
        title: values.title,
        eventType: values.eventType,
        schedulingMode: "FIXED",
        startAt,
        endAt,
        timeZone: draft.timeZone,
        ...(optional("description") !== undefined ? { description: values.description } : {}),
      };
    }
    default:
      return null;
  }
}
