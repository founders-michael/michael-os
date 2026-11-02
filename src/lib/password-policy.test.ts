import assert from "node:assert/strict";
import test from "node:test";
import { getPasswordRequirementState, meetsPasswordPolicy } from "./password-policy";

test("password policy requires 12 characters, uppercase, and lowercase", () => {
  assert.equal(meetsPasswordPolicy("MichaelOS2026"), true);
  assert.equal(meetsPasswordPolicy("michaelos2026"), false);
  assert.equal(meetsPasswordPolicy("MICHAELOS2026"), false);
  assert.equal(meetsPasswordPolicy("MiChael2026"), false);
});

test("password requirement state marks each satisfied rule", () => {
  assert.deepEqual(getPasswordRequirementState("Michael"), [
    { id: "length", label: "At least 12 characters", met: false },
    { id: "uppercase", label: "One uppercase letter (A–Z)", met: true },
    { id: "lowercase", label: "One lowercase letter (a–z)", met: true },
  ]);
});

test("password policy rejects values longer than Better Auth's configured maximum", () => {
  assert.equal(meetsPasswordPolicy(`Aa${"b".repeat(127)}`), false);
  assert.equal(meetsPasswordPolicy(`Aa${"b".repeat(126)}`), true);
});
