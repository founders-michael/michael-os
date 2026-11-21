import assert from "node:assert/strict";
import test from "node:test";
import { emailTemplates, LOGO_CONTENT_ID, renderEmail } from "@/emails/render";
import { emailTheme } from "@/emails/theme";
import { MICHAEL_LOGO_PNG_BASE64 } from "@/emails/assets/michael-logo";
import { readFileSync } from "node:fs";

const cid = { kind: "cid" as const, contentId: LOGO_CONTENT_ID };
const base = { greetingName: "Sam", settingsUrl: "https://app.example/settings/notifications" };

const task = { ...base, title: "Submit the tax form <script>", dueLabel: "Sat, 22 Nov", reminderLabel: "09:00 (Asia/Kolkata)", priority: "High" as const, repeatLabel: "Every Mon", goals: ["Get finances in order"], notes: "Bring last year's receipts.", taskUrl: "https://app.example/tasks" };
const goal = { ...base, title: "Run a half marathon", progress: 62, targetLabel: "Wed, 31 Dec", timeLeftLabel: "40 days left", milestones: { completed: 3, total: 5 }, nextMilestone: "Run 15 km", goalUrl: "https://app.example/goals" };
const habit = { ...base, title: "Morning walk", scheduleLabel: "Every day", timeLabel: "07:00", currentStreak: 12, bestStreak: 30, completionPercent: 84, doneToday: false, habitsUrl: "https://app.example/habits" };

test("every template carries the logo, its own kicker and colour, the footer and the settings link", async () => {
  const rendered = await Promise.all([renderEmail("taskReminder", task, cid), renderEmail("goalReminder", goal, cid), renderEmail("habitReminder", habit, cid)]);
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

test("the goal email draws progress and milestones", async () => {
  const { html, subject } = await renderEmail("goalReminder", goal, cid);
  assert.equal(subject, "Goal check-in: Run a half marathon");
  for (const fragment of ["62% complete", 'width="62%"', "3 of 5 done", "Run 15 km", "40 days left"]) assert.ok(html.includes(fragment), fragment);
});

test("the habit email shows the streaks and today's state", async () => {
  const pending = await renderEmail("habitReminder", habit, cid);
  assert.equal(pending.subject, "Habit reminder: Morning walk");
  for (const fragment of ["12 days", "current streak", "30 days", "84%", "Not done yet", "keep your streak going"]) assert.ok(pending.html.includes(fragment), fragment);
  const done = await renderEmail("habitReminder", { ...habit, doneToday: true, currentStreak: 1 }, cid);
  assert.equal(done.subject, "Morning walk: done today");
  assert.match(done.html, /1 day</);
});

test("extras add content to any template without a new template", async () => {
  const extras = { intro: "Quick nudge from Michael.", details: [{ label: "Location", value: "Tax office" }], note: { title: "Tip", text: "It takes 20 minutes." }, secondaryAction: { label: "Snooze", href: "https://app.example/snooze" }, footerNote: "Sent at your request." };
  for (const [name, props] of [["taskReminder", task], ["goalReminder", goal], ["habitReminder", habit]] as const) {
    const { html } = await renderEmail(name, { ...props, extras } as never, cid);
    for (const fragment of ["Quick nudge from Michael.", "Location", "Tax office", "Tip", "It takes 20 minutes.", "https://app.example/snooze", "Sent at your request."]) assert.ok(html.includes(fragment), `${name}: ${fragment}`);
    assert.doesNotMatch(html, /Hi Sam/, `${name}: the intro should replace the greeting`);
  }
});

test("a preview can show the logo from a data URI instead of an attachment", async () => {
  const { html } = await renderEmail("habitReminder", habit, { kind: "src", src: "data:image/png;base64,AAAA" });
  assert.match(html, /src="data:image\/png;base64,AAAA"/);
});

test("the bundled logo is the PNG it was generated from", () => {
  assert.equal(MICHAEL_LOGO_PNG_BASE64, readFileSync("src/emails/assets/michael-logo.png").toString("base64"));
});
