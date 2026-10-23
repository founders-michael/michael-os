import { z } from "zod";
import { DEFAULT_TIME_ZONE } from "@/lib/time-zone";

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

export const profileProgressSchema = z.object({
  preferredName: z.string().trim().min(1, "Add a preferred name.").max(80),
  timeZone: z.string().trim().min(1).refine(isIanaTimeZone, "Enter a valid IANA time zone, such as Asia/Kolkata."),
  wakeUpTime: timeOfDay,
  bedtime: timeOfDay,
  workStartTime: timeOfDay.nullable(),
  workEndTime: timeOfDay.nullable(),
  workDays: z.array(z.enum(dayNames)).max(7),
  priorities: z.array(z.string().trim().min(1).max(100)).max(3),
  focusSessionMinutes: z.number().int().min(15).max(180),
  breakDurationMinutes: z.number().int().min(0).max(60),
  planningStyle: z.enum(["STRUCTURED", "BALANCED", "FLEXIBLE"]),
  onboardingStep: z.number().int().min(0).max(5),
}).strict().superRefine((profile, context) => {
  if (profile.workDays.length !== new Set(profile.workDays).size) {
    context.addIssue({ code: "custom", path: ["workDays"], message: "Remove duplicate work days." });
  }

  if ((profile.workStartTime === null) !== (profile.workEndTime === null)) {
    context.addIssue({ code: "custom", path: ["workEndTime"], message: "Add both work hours or leave both blank." });
  }

  if (profile.workStartTime && profile.workEndTime && profile.workStartTime >= profile.workEndTime) {
    context.addIssue({ code: "custom", path: ["workEndTime"], message: "End time must be after start time." });
  }
});

export type ProfileProgressInput = z.infer<typeof profileProgressSchema>;

export type ProfileFormData = Omit<ProfileProgressInput, "onboardingStep">;

export const defaultProfileFormData = (preferredName: string, timeZone = DEFAULT_TIME_ZONE): ProfileFormData => ({
  preferredName,
  timeZone,
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
