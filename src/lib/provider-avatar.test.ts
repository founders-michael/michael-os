import assert from "node:assert/strict";
import test from "node:test";
import { githubAvatarFromProfile, pictureFromGoogleIdToken } from "./provider-avatar";

function idToken(claims: Record<string, unknown>) {
  const part = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${part({ alg: "RS256" })}.${part(claims)}.signature`;
}

test("reads the picture claim from a Google ID token", () => {
  assert.equal(pictureFromGoogleIdToken(idToken({ picture: "https://lh3.googleusercontent.com/a/abc=s96-c" })), "https://lh3.googleusercontent.com/a/abc=s96-c");
});

test("refuses a missing, malformed, insecure or foreign Google picture", () => {
  assert.equal(pictureFromGoogleIdToken(null), null);
  assert.equal(pictureFromGoogleIdToken("not-a-jwt"), null);
  assert.equal(pictureFromGoogleIdToken("a.!!!.c"), null);
  assert.equal(pictureFromGoogleIdToken(idToken({})), null);
  assert.equal(pictureFromGoogleIdToken(idToken({ picture: "http://lh3.googleusercontent.com/a" })), null);
  assert.equal(pictureFromGoogleIdToken(idToken({ picture: "https://evil.example/googleusercontent.com.png" })), null);
  assert.equal(pictureFromGoogleIdToken(idToken({ picture: "https://googleusercontent.com.evil.example/a" })), null);
  assert.equal(pictureFromGoogleIdToken(idToken({ picture: "javascript:alert(1)" })), null);
});

test("reads a GitHub avatar only from GitHub's avatar host", () => {
  assert.equal(githubAvatarFromProfile({ avatar_url: "https://avatars.githubusercontent.com/u/1?v=4" }), "https://avatars.githubusercontent.com/u/1?v=4");
  assert.equal(githubAvatarFromProfile({ avatar_url: "https://example.com/a.png" }), null);
  assert.equal(githubAvatarFromProfile(null), null);
});
