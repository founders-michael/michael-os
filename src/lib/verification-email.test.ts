import assert from "node:assert/strict";
import test from "node:test";
import { buildVerificationEmail, isUndeliverableTestAddress } from "./verification-email";

test("verification email carries the link in both parts and escapes the name", () => {
  const url = "https://michael.example/api/auth/verify-email?token=abc&callbackURL=%2Flifestyle%2Flogin";
  const email = buildVerificationEmail({ name: "<script>alert(1)</script> Smith", url });
  assert.equal(email.subject, "Verify your email for MichaelOS");
  assert.ok(email.text.includes(url));
  assert.ok(email.html.includes(url.replaceAll("&", "&amp;")));
  assert.ok(!email.html.includes("<script>"));
  assert.ok(email.html.includes("&lt;script&gt;alert(1)&lt;/script&gt;"));
  assert.ok(email.text.includes("expires in 1 hour"));
});

test("greeting uses the first name only and falls back when empty", () => {
  assert.ok(buildVerificationEmail({ name: "Ada Lovelace", url: "https://x.test/v" }).text.startsWith("Hi Ada,"));
  assert.ok(buildVerificationEmail({ name: "   ", url: "https://x.test/v" }).text.startsWith("Hi,"));
});

test("lifetime wording follows the configured expiry", () => {
  assert.ok(buildVerificationEmail({ name: "A", url: "u", expiresInSeconds: 1800 }).text.includes("expires in 30 minutes"));
  assert.ok(buildVerificationEmail({ name: "A", url: "u", expiresInSeconds: 7200 }).text.includes("expires in 2 hours"));
});

test("reserved test domains are undeliverable, real ones are not", () => {
  for (const address of ["a@example.test", "a@example.com", "a@mail.example.org", "a@foo.invalid", "a@app.localhost", "a@x.example", "no-at-sign"]) {
    assert.equal(isUndeliverableTestAddress(address), true, address);
  }
  for (const address of ["someone@gmail.com", "a@examples.com", "a@notexample.com", "a@testing.io"]) {
    assert.equal(isUndeliverableTestAddress(address), false, address);
  }
});
