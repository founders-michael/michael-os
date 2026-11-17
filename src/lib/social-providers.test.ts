import assert from "node:assert/strict";
import test from "node:test";
import { enabledSocialProviders, googleNativeClientIds, socialProviderCredentials } from "./social-providers";

test("a provider is enabled only when both its id and secret are set", () => {
  assert.deepEqual(enabledSocialProviders({}), []);
  assert.deepEqual(enabledSocialProviders({ GOOGLE_CLIENT_ID: "id" }), []);
  assert.deepEqual(enabledSocialProviders({ GOOGLE_CLIENT_ID: "id", GOOGLE_CLIENT_SECRET: "  " }), []);
  assert.deepEqual(enabledSocialProviders({ GOOGLE_CLIENT_ID: "id", GOOGLE_CLIENT_SECRET: "secret" }), ["google"]);
  assert.deepEqual(enabledSocialProviders({ GITHUB_CLIENT_ID: "a", GITHUB_CLIENT_SECRET: "b", GOOGLE_CLIENT_ID: "c", GOOGLE_CLIENT_SECRET: "d" }), ["google", "github"]);
});

test("credentials are trimmed", () => {
  assert.deepEqual(socialProviderCredentials({ GITHUB_CLIENT_ID: " a ", GITHUB_CLIENT_SECRET: "b\n" }).github, { clientId: "a", clientSecret: "b" });
});

test("native Google client IDs are optional, trimmed and ordered iOS then Android", () => {
  assert.deepEqual(googleNativeClientIds({}), []);
  assert.deepEqual(googleNativeClientIds({ GOOGLE_ANDROID_CLIENT_ID: " android " }), ["android"]);
  assert.deepEqual(googleNativeClientIds({ GOOGLE_IOS_CLIENT_ID: "ios", GOOGLE_ANDROID_CLIENT_ID: "android" }), ["ios", "android"]);
  assert.deepEqual(googleNativeClientIds({ GOOGLE_IOS_CLIENT_ID: "  " }), []);
});
