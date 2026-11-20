import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { render } from "@react-email/render";
import TaskReminderEmail from "@/emails/task-reminder";

const props = {
  greetingName: "Sam", title: "Submit the tax form <script>", dueLabel: "Due Fri, 21 Nov", reminderLabel: "Reminder set for 09:00 (Asia/Kolkata)",
  taskUrl: "https://app.example/tasks", settingsUrl: "https://app.example/settings/notifications",
};

test("the reminder email renders the task, the links and how to turn reminders off", async () => {
  const html = await render(createElement(TaskReminderEmail, props));
  assert.match(html, /Submit the tax form &lt;script&gt;/, "the title must be escaped");
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /href="https:\/\/app\.example\/tasks"/);
  assert.match(html, /href="https:\/\/app\.example\/settings\/notifications"/);
  assert.match(html, /Due Fri, 21 Nov/);
});

test("the plain-text part carries the same information", async () => {
  const text = await render(createElement(TaskReminderEmail, props), { plainText: true });
  assert.match(text, /Submit the tax form/i); // headings are capitalized in plain text
  assert.match(text, /Reminder set for 09:00/);
  assert.match(text, /settings\/notifications/);
});

test("without a name or due date it still reads well", async () => {
  const html = await render(createElement(TaskReminderEmail, { ...props, greetingName: null, dueLabel: null }));
  assert.match(html, /Here.{1,8}s the reminder you set/);
  assert.doesNotMatch(html, /Due /);
});
