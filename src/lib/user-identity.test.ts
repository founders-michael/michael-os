import assert from "node:assert/strict";
import test from "node:test";
import { avatarFor, buildUserIdentity, displayNameFor, greetingNameFor, initialsFor, PROFILE_IMAGE_PATH } from "./user-identity";

test("name falls back from preferred to full name to email username to generic", () => {
  assert.deepEqual(displayNameFor({ preferredName: "Vibhor", fullName: "Vibhor Agarwal", email: "v@example.com" }), { name: "Vibhor", source: "preferred" });
  assert.deepEqual(displayNameFor({ preferredName: "  ", fullName: "Vibhor Agarwal", email: "v@example.com" }), { name: "Vibhor Agarwal", source: "fullName" });
  assert.deepEqual(displayNameFor({ preferredName: null, fullName: "", email: "ada.l@example.com" }), { name: "ada.l", source: "email" });
  assert.deepEqual(displayNameFor({}), { name: "Your account", source: "generic" });
});

test("greeting keeps a preferred name whole and shortens a full name", () => {
  assert.equal(greetingNameFor({ preferredName: "Dr. Rao", fullName: "Anita Rao" }), "Dr. Rao");
  assert.equal(greetingNameFor({ fullName: "Anita   Rao" }), "Anita");
  assert.equal(greetingNameFor({ email: "anita@example.com" }), "anita");
  assert.equal(greetingNameFor({}), "there");
});

test("names are whitespace-collapsed and bounded", () => {
  assert.equal(displayNameFor({ preferredName: " Ada\n\tL " }).name, "Ada L");
  assert.equal(displayNameFor({ preferredName: "x".repeat(200) }).name.length, 80);
});

test("initials use up to two words", () => {
  assert.equal(initialsFor("vibhor agarwal kumar"), "VA");
  assert.equal(initialsFor(""), "U");
});

test("an uploaded photo wins, versioned; otherwise an https provider photo; otherwise none", () => {
  const at = new Date("2026-11-16T10:00:00.000Z");
  assert.deepEqual(avatarFor({ customImageUpdatedAt: at, providerImage: "https://lh3.googleusercontent.com/a" }), { url: `${PROFILE_IMAGE_PATH}?v=${at.getTime()}`, source: "custom" });
  assert.deepEqual(avatarFor({ providerImage: "https://avatars.githubusercontent.com/u/1" }), { url: "https://avatars.githubusercontent.com/u/1", source: "provider" });
  assert.deepEqual(avatarFor({ providerImage: "http://insecure.example/a.png" }), { url: null, source: "none" });
  assert.deepEqual(avatarFor({ providerImage: "javascript:alert(1)" }), { url: null, source: "none" });
  assert.deepEqual(avatarFor({}), { url: null, source: "none" });
});

test("the built identity is consistent", () => {
  const identity = buildUserIdentity({ preferredName: "Vibhor", fullName: "Vibhor Agarwal", email: "v@example.com" });
  assert.equal(identity.displayName, "Vibhor");
  assert.equal(identity.greetingName, "Vibhor");
  assert.equal(identity.initials, "V");
  assert.equal(identity.avatarSource, "none");
  assert.equal(buildUserIdentity({}).initials, "U");
});
