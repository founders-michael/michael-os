import { strict as assert } from "node:assert";
import { test } from "node:test";
import { z } from "zod";
import { firstFieldErrors } from "@/lib/form-validation";

test("maps the first Zod issue per field to an accessible field message", () => {
  const schema = z.object({ name: z.string().min(2, "Use at least two characters."), email: z.email() });
  const result = schema.safeParse({ name: "", email: "bad" });
  assert.equal(result.success, false);
  if (!result.success) assert.deepEqual(firstFieldErrors(result.error), { name: "Use at least two characters.", email: "Invalid email address" });
});
