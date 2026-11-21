import assert from "node:assert/strict";
import test from "node:test";
import {
  channelOn, DEFAULT_NOTIFICATION_PREFERENCES as ALL_ON, fromColumns, notificationPreferenceSchema, toColumns, withCategory, withChannel,
} from "@/lib/notification-preferences";

test("a channel's main switch is on while any category is on, and off only when all are", () => {
  let prefs = withCategory(ALL_ON, "email", "habits", false);
  assert.equal(channelOn(prefs, "email"), true);
  prefs = withCategory(withCategory(prefs, "email", "goals", false), "email", "tasks", false);
  assert.equal(channelOn(prefs, "email"), false);
  assert.equal(channelOn(prefs, "inApp"), true, "the other channel is untouched");
});

test("turning one category on turns its channel's main switch on", () => {
  const off = withChannel(ALL_ON, "email", false);
  assert.equal(channelOn(off, "email"), false);
  const one = withCategory(off, "email", "tasks", true);
  assert.equal(channelOn(one, "email"), true);
  assert.deepEqual(one.email, { tasks: true, goals: false, habits: false });
});

test("the main switch turns every category of its channel off, or on", () => {
  const off = withChannel(ALL_ON, "inApp", false);
  assert.deepEqual(off.inApp, { tasks: false, goals: false, habits: false });
  assert.deepEqual(off.email, ALL_ON.email);
  assert.deepEqual(withChannel(off, "inApp", true).inApp, { tasks: true, goals: true, habits: true });
});

test("preferences round-trip through the stored columns; no row means all on", () => {
  const prefs = withCategory(withCategory(ALL_ON, "email", "habits", false), "inApp", "goals", false);
  assert.deepEqual(fromColumns(toColumns(prefs)), prefs);
  assert.deepEqual(fromColumns(null), ALL_ON);
});

test("the API accepts exactly both channels with all three categories", () => {
  assert.equal(notificationPreferenceSchema.safeParse(ALL_ON).success, true);
  assert.equal(notificationPreferenceSchema.safeParse({ inApp: true, email: true }).success, false);
  assert.equal(notificationPreferenceSchema.safeParse({ inApp: ALL_ON.inApp }).success, false);
  assert.equal(notificationPreferenceSchema.safeParse({ ...ALL_ON, email: { tasks: true, goals: true } }).success, false);
  assert.equal(notificationPreferenceSchema.safeParse({ ...ALL_ON, userId: "u2" }).success, false);
});
