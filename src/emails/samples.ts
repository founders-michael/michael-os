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
    goalDigest: {
      greetingName: "Vibhor", settingsUrl, goalsUrl: `${origin}/goals`, periodLabel: "This week",
      goals: [
        { title: "Run a half marathon", progress: 62, targetLabel: "Wed, 31 Dec · 39 days left", milestones: { completed: 3, total: 5 }, nextStep: "Run 15 km without stopping" },
        { title: "Read 12 books this year", progress: 75, targetLabel: "Wed, 31 Dec · 39 days left", milestones: { completed: 9, total: 12 }, nextStep: "Finish 'Deep Work'" },
        { title: "Learn Spanish", progress: 20, targetLabel: null, milestones: null, nextStep: null },
      ],
    },
    habitDigest: {
      greetingName: "Vibhor", settingsUrl, habitsUrl: `${origin}/habits`, slot: "morning", dayLabel: "Monday, 23 Nov", doneCount: 0,
      habits: [
        { title: "Morning walk", timeLabel: "07:00–07:30", currentStreak: 12, doneToday: false },
        { title: "Read for 20 minutes", timeLabel: "21:00", currentStreak: 4, doneToday: false },
        { title: "Drink 8 glasses of water", timeLabel: null, currentStreak: 0, doneToday: false },
      ],
      extras: { note: { title: "You're close", text: "Three more days of walking and this is your second-longest streak." } },
    },
  };
}
