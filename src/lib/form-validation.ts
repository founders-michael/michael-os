import type { ZodError } from "zod";

/** Converts Zod paths into the first accessible, field-level message. */
export function firstFieldErrors(error: ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const field = issue.path.map(String).join(".");
    if (field && !fields[field]) fields[field] = issue.message;
  }
  return fields;
}
