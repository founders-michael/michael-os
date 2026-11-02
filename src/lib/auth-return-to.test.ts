import assert from "node:assert/strict";
import test from "node:test";
import { safeInvitationReturnTo } from "@/lib/auth-return-to";

test("invitation authentication return paths are constrained to the local acceptance page", () => {
  const token = "a".repeat(48);
  assert.equal(safeInvitationReturnTo(`/accept-invitation?token=${token}`), `/accept-invitation?token=${token}`);
  assert.equal(safeInvitationReturnTo("https://evil.example/accept-invitation?token=abc"), undefined);
  assert.equal(safeInvitationReturnTo("/settings?next=/accept-invitation"), undefined);
  assert.equal(safeInvitationReturnTo(`/accept-invitation?token=${"x".repeat(20)}`), undefined);
});
