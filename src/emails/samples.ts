import type { EmailTemplateName, EmailTemplateProps } from "@/emails/render";

/**
 * Sample content for every template, used by `npm run email:preview` and
 * `npm run email:send-samples`. Made up; never a real user's data.
 */
export function emailSamples(origin: string): { [N in EmailTemplateName]: EmailTemplateProps[N] } {
  const settingsUrl = `${origin}/settings/notifications`;
  return {
    taskReminder: {
      greetingName: "Vibhor", settingsUrl, taskUrl: `${origin}/tasks`,
      title: "Submit the quarterly tax form", dueLabel: "Sat, 22 Nov", reminderLabel: "09:00 (Asia/Kolkata)",
      priority: "High", repeatLabel: "Monthly on the 22nd", goals: ["Get finances in order"],
      notes: "Bring last quarter's receipts and the bank statement.",
    },
    goalReminder: {
      greetingName: "Vibhor", settingsUrl, goalUrl: `${origin}/goals`,
      title: "Run a half marathon", progress: 62, targetLabel: "Wed, 31 Dec", timeLeftLabel: "40 days left",
      milestones: { completed: 3, total: 5 }, nextMilestone: "Run 15 km without stopping",
    },
    habitReminder: {
      greetingName: "Vibhor", settingsUrl, habitsUrl: `${origin}/habits`,
      title: "Morning walk", scheduleLabel: "Every day", timeLabel: "07:00–07:30",
      currentStreak: 12, bestStreak: 30, completionPercent: 84, doneToday: false,
      extras: { note: { title: "You're close", text: "Three more days and this is your second-longest streak." } },
    },
  };
}
