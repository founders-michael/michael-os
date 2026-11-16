import assert from "node:assert/strict";
import test from "node:test";
import { isEmailNotVerifiedError, verificationLinkMessage } from "./auth-messages";

test("known verification link codes map to their own message", () => {
  assert.match(verificationLinkMessage("TOKEN_EXPIRED")!, /expired/);
  assert.match(verificationLinkMessage("INVALID_TOKEN")!, /isn't valid/);
});

test("no code means no message; an unknown code is never echoed", () => {
  assert.equal(verificationLinkMessage(undefined), null);
  assert.equal(verificationLinkMessage(""), null);
  const message = verificationLinkMessage("<b>injected</b>")!;
  assert.ok(!message.includes("injected"));
});

test("only the EMAIL_NOT_VERIFIED code counts as an unverified sign-in", () => {
  assert.equal(isEmailNotVerifiedError({ code: "EMAIL_NOT_VERIFIED", status: 403 }), true);
  assert.equal(isEmailNotVerifiedError({ code: "INVALID_EMAIL_OR_PASSWORD", status: 401 }), false);
  assert.equal(isEmailNotVerifiedError(null), false);
});
