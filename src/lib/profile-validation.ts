import { z } from "zod";
import { DEFAULT_TIME_ZONE } from "@/lib/time-zone";
import { LOCATION_LABEL_MAX_LENGTH } from "@/lib/place-search";

const timeOfDay = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use a time in HH:mm format.");
const dayNames = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"] as const;

function isIanaTimeZone(value: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

const routineFields = {
  timeZone: z.string().trim().min(1).transform((value) => value === "IST" ? DEFAULT_TIME_ZONE : value).refine(isIanaTimeZone, "Enter a valid IANA time zone, such as Asia/Kolkata."),
  /** The city the user picked, for display ("Bengaluru, Karnataka, India"); null when they chose a zone directly. */
  locationLabel: z.string().transform((value) => value.replace(/\s+/g, " ").trim()).pipe(z.string().max(LOCATION_LABEL_MAX_LENGTH)).transform((value) => value || null).nullable().optional(),
  wakeUpTime: timeOfDay,
  bedtime: timeOfDay,
  workStartTime: timeOfDay.nullable(),
  workEndTime: timeOfDay.nullable(),
  workDays: z.array(z.enum(dayNames)).max(7),
  priorities: z.array(z.string().trim().min(1).max(100)).max(3),
  focusSessionMinutes: z.number().int().min(15).max(180),
  breakDurationMinutes: z.number().int().min(0).max(60),
  planningStyle: z.enum(["STRUCTURED", "BALANCED", "FLEXIBLE"]),
};

type RoutineShape = { workDays: string[]; workStartTime: string | null; workEndTime: string | null };

function refineRoutine(profile: RoutineShape, context: z.RefinementCtx) {
  if (profile.workDays.length !== new Set(profile.workDays).size) {
    context.addIssue({ code: "custom", path: ["workDays"], message: "Remove duplicate work days." });
  }

  if ((profile.workStartTime === null) !== (profile.workEndTime === null)) {
    context.addIssue({ code: "custom", path: ["workEndTime"], message: "Add both work hours or leave both blank." });
  }

  if (profile.workStartTime && profile.workEndTime && profile.workStartTime >= profile.workEndTime) {
    context.addIssue({ code: "custom", path: ["workEndTime"], message: "End time must be after start time." });
  }
}

/**
 * The routine and planning preferences, edited under Insights & Context. The
 * preferred name is deliberately absent: it belongs to Settings → Account, so
 * saving the routine can never overwrite a name changed elsewhere.
 */
export const profileRoutineSchema = z.object(routineFields).strict().superRefine(refineRoutine);
export type ProfileRoutineInput = z.infer<typeof profileRoutineSchema>;

/** Onboarding saves everything at once, including the preferred name. */
export const profileProgressSchema = z.object({
  preferredName: z.string().trim().min(1, "Add a preferred name.").max(80),
  ...routineFields,
  onboardingStep: z.number().int().min(0).max(5),
}).strict().superRefine((profile, context) => {
  refineRoutine(profile, context);
});

export type ProfileProgressInput = z.infer<typeof profileProgressSchema>;

export type ProfileFormData = Omit<ProfileProgressInput, "onboardingStep">;

export const defaultProfileFormData = (preferredName: string, timeZone = DEFAULT_TIME_ZONE): ProfileFormData => ({
  preferredName,
  timeZone,
  locationLabel: null,
  wakeUpTime: "07:00",
  bedtime: "22:30",
  workStartTime: null,
  workEndTime: null,
  workDays: ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"],
  priorities: [],
  focusSessionMinutes: 50,
  breakDurationMinutes: 10,
  planningStyle: "BALANCED",
});
