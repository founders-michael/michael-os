import assert from "node:assert/strict";
import test from "node:test";
import { isEmailNotVerifiedError, authRedirectMessage } from "./auth-messages";

test("known verification link codes map to their own message", () => {
  assert.match(authRedirectMessage("TOKEN_EXPIRED")!, /expired/);
  assert.match(authRedirectMessage("INVALID_TOKEN")!, /isn't valid/);
});

test("no code means no message; an unknown code is never echoed", () => {
  assert.equal(authRedirectMessage(undefined), null);
  assert.equal(authRedirectMessage(""), null);
  const message = authRedirectMessage("<b>injected</b>")!;
  assert.ok(!message.includes("injected"));
});

test("only the EMAIL_NOT_VERIFIED code counts as an unverified sign-in", () => {
  assert.equal(isEmailNotVerifiedError({ code: "EMAIL_NOT_VERIFIED", status: 403 }), true);
  assert.equal(isEmailNotVerifiedError({ code: "INVALID_EMAIL_OR_PASSWORD", status: 401 }), false);
  assert.equal(isEmailNotVerifiedError(null), false);
});

test("social sign-in codes map to their own message, unknown lower-case codes to a generic one", () => {
  assert.match(authRedirectMessage("account_not_linked")!, /already exists/);
  assert.match(authRedirectMessage("access_denied")!, /cancelled/);
  assert.match(authRedirectMessage("something_new")!, /with that provider/);
  // Inherited object keys are not messages.
  assert.match(authRedirectMessage("constructor")!, /with that provider/);
  assert.match(authRedirectMessage("toString")!, /with that provider/);
});
