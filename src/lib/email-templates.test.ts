import assert from "node:assert/strict";
import test from "node:test";
import { emailTemplates, LOGO_CONTENT_ID, renderEmail } from "@/emails/render";
import { emailTheme } from "@/emails/theme";
import { MICHAEL_LOGO_PNG_BASE64 } from "@/emails/assets/michael-logo";
import { readFileSync } from "node:fs";

const cid = { kind: "cid" as const, contentId: LOGO_CONTENT_ID };
const base = { greetingName: "Sam", settingsUrl: "https://app.example/settings/notifications" };

const task = { ...base, title: "Submit the tax form <script>", dueLabel: "Sat, 22 Nov", reminderLabel: "09:00 (Asia/Kolkata)", priority: "High" as const, repeatLabel: "Every Mon", goals: ["Get finances in order"], notes: "Bring last year's receipts.", taskUrl: "https://app.example/tasks" };
const goal = { ...base, periodLabel: "This week", goalsUrl: "https://app.example/goals", goals: [
  { title: "Run a half marathon", progress: 62, targetLabel: "Wed, 31 Dec · 40 days left", milestones: { completed: 3, total: 5 }, nextStep: "Run 15 km" },
  { title: "Learn Spanish", progress: 0, targetLabel: null, milestones: null, nextStep: null },
] };
const habit = { ...base, slot: "morning" as const, dayLabel: "Monday, 23 Nov", doneCount: 0, habitsUrl: "https://app.example/habits", habits: [
  { title: "Morning walk", timeLabel: "07:00", currentStreak: 12, doneToday: false },
  { title: "Drink water", timeLabel: null, currentStreak: 1, doneToday: false },
] };

test("every template carries the logo, its own kicker and colour, the footer and the settings link", async () => {
  const rendered = await Promise.all([renderEmail("taskReminder", task, cid), renderEmail("goalDigest", goal, cid), renderEmail("habitDigest", habit, cid)]);
  const kinds = [emailTheme.kinds.task, emailTheme.kinds.goal, emailTheme.kinds.habit];
  rendered.forEach(({ html }, index) => {
    assert.match(html, new RegExp(`src="cid:${LOGO_CONTENT_ID}"`));
    assert.match(html, new RegExp(kinds[index]!.kicker));
    assert.match(html, new RegExp(kinds[index]!.accent));
    assert.match(html, /settings\/notifications/);
    assert.match(html, /Settings → Notifications/);
  });
  assert.equal(Object.keys(emailTemplates).length, 3);
});

test("the task email shows each detail it is given, escaped, and clips long notes", async () => {
  const { html, subject, text } = await renderEmail("taskReminder", { ...task, notes: "x".repeat(400) }, cid);
  assert.equal(subject, "Reminder: Submit the tax form <script>");
  assert.match(html, /Submit the tax form &lt;script&gt;/);
  assert.doesNotMatch(html, /<script>/);
  for (const fragment of ["Sat, 22 Nov", "09:00 (Asia/Kolkata)", "High", "Every Mon", "Get finances in order", "Open task"]) assert.ok(html.includes(fragment), fragment);
  assert.match(html, /x{270,279}…/);
  assert.match(text, /Submit the tax form/i);
});

test("a template leaves out what it isn't given", async () => {
  const { html } = await renderEmail("taskReminder", { ...base, title: "Plain", dueLabel: null, reminderLabel: "09:00 (UTC)", taskUrl: "https://app.example/tasks" }, cid);
  for (const label of [">Due<", ">Priority<", ">Repeats<", ">Goal<"]) assert.doesNotMatch(html, new RegExp(label));
});

test("the goal check-in shows every goal's progress and next step", async () => {
  const { html, subject } = await renderEmail("goalDigest", goal, cid);
  assert.equal(subject, "This week's goal check-in: 2 in progress");
  for (const fragment of ["Run a half marathon", "62% complete", 'width="62%"', "40 days left", "3 of 5 done", "Run 15 km", "Learn Spanish", "0% complete", "Add a milestone to plan the next step."]) assert.ok(html.includes(fragment), fragment);
});

test("the habit nudge lists today's habits in the morning and what's left in the evening", async () => {
  const morning = await renderEmail("habitDigest", habit, cid);
  assert.equal(morning.subject, "Today's habits: 2 to do");
  for (const fragment of ["Morning walk", "07:00", "12-day streak", "Drink water", "Any time today", "1-day streak", "Monday, 23 Nov"]) assert.ok(morning.html.includes(fragment), fragment);
  const evening = await renderEmail("habitDigest", { ...habit, slot: "evening", doneCount: 3, habits: habit.habits.slice(0, 1) }, cid);
  assert.equal(evening.subject, "Still to do today: 1 habit");
  assert.ok(evening.html.includes("3 done today"));
});

test("extras add content to any template without a new template", async () => {
  const extras = { intro: "Quick nudge from Michael.", details: [{ label: "Location", value: "Tax office" }], note: { title: "Tip", text: "It takes 20 minutes." }, secondaryAction: { label: "Snooze", href: "https://app.example/snooze" }, footerNote: "Sent at your request." };
  for (const [name, props] of [["taskReminder", task], ["goalDigest", goal], ["habitDigest", habit]] as const) {
    const { html } = await renderEmail(name, { ...props, extras } as never, cid);
    for (const fragment of ["Quick nudge from Michael.", "Location", "Tax office", "Tip", "It takes 20 minutes.", "https://app.example/snooze", "Sent at your request."]) assert.ok(html.includes(fragment), `${name}: ${fragment}`);
    assert.doesNotMatch(html, /Hi Sam/, `${name}: the intro should replace the greeting`);
  }
});

test("a preview can show the logo from a data URI instead of an attachment", async () => {
  const { html } = await renderEmail("habitDigest", habit, { kind: "src", src: "data:image/png;base64,AAAA" });
  assert.match(html, /src="data:image\/png;base64,AAAA"/);
});

test("the bundled logo is the PNG it was generated from", () => {
  assert.equal(MICHAEL_LOGO_PNG_BASE64, readFileSync("src/emails/assets/michael-logo.png").toString("base64"));
});
