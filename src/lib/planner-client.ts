import "server-only";

import { z } from "zod";
import type { PlannerConstraintInput, PlannerProposal } from "./calendar-planner-contract";

const instant = z.string().datetime({ offset: true });
const proposalSchema = z.object({
  requestId: z.string().min(1),
  horizon: z.object({ from: instant, to: instant }).strict(),
  timeZone: z.string().min(1),
  solverStatus: z.enum(["OPTIMAL", "FEASIBLE", "INFEASIBLE", "TIMEOUT", "ERROR"]),
  planningDurationMs: z.number().int().nonnegative(),
  generatedAt: instant,
  proposedActivities: z.array(z.object({
    existingEventId: z.string().nullable(), taskId: z.string().min(1),
    startAt: instant, endAt: instant, timeZone: z.string().min(1),
    durationMinutes: z.number().int().positive(), sessionIndex: z.number().int().positive(), sessionCount: z.number().int().positive(),
  }).strict()),
  explanations: z.array(z.object({ taskId: z.string().nullable(), message: z.string(), code: z.string() }).strict()),
  unscheduledTasks: z.array(z.object({ taskId: z.string(), reasonCode: z.string(), reason: z.string() }).strict()),
  conflicts: z.array(z.object({ existingEventId: z.string(), otherEventId: z.string(), proposedTaskId: z.string().nullable(), startAt: instant, endAt: instant, eventType: z.string() }).strict()),
  warnings: z.array(z.object({ code: z.string(), message: z.string() }).strict()),
  summary: z.object({ tasksRequested: z.number().int().nonnegative(), tasksScheduled: z.number().int().nonnegative(), tasksUnscheduled: z.number().int().nonnegative(), minutesScheduled: z.number().int().nonnegative(), minutesAvailable: z.number().int().nonnegative(), minutesRequired: z.number().int().nonnegative() }).strict(),
}).strict();

export type PlannerClientErrorCode = "NOT_CONFIGURED" | "UNAUTHORIZED" | "INVALID_REQUEST" | "SERVICE_UNAVAILABLE" | "SOLVER_FAILURE" | "INVALID_RESPONSE" | "TIMEOUT";
export class PlannerClientError extends Error {
  constructor(readonly code: PlannerClientErrorCode, message: string, readonly status?: number, readonly validationPaths: string[] = []) {
    super(message);
    this.name = "PlannerClientError";
  }
}

export async function generatePlannerProposal(input: PlannerConstraintInput): Promise<PlannerProposal> {
  const baseUrl = process.env.PLANNER_SERVICE_URL?.trim();
  const token = process.env.PLANNER_SERVICE_TOKEN;
  if (!baseUrl || !token) throw new PlannerClientError("NOT_CONFIGURED", "The planning service is not configured.");

  let endpoint: URL;
  try {
    endpoint = new URL("/v1/plans/generate", baseUrl);
    if (endpoint.protocol !== "http:" && endpoint.protocol !== "https:") throw new Error("unsupported protocol");
    if (endpoint.username || endpoint.password) throw new Error("credentials are not allowed in the service URL");
    const host = endpoint.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    const loopback = host === "localhost" || host === "127.0.0.1" || host === "::1";
    if (endpoint.protocol === "http:" && !loopback) throw new Error("HTTPS is required for non-loopback planner services");
  } catch {
    throw new PlannerClientError("NOT_CONFIGURED", "The planning service URL is invalid.");
  }

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      redirect: "error",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}`, accept: "application/json" },
      body: JSON.stringify(input),
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") throw new PlannerClientError("TIMEOUT", "The planning service did not respond in time.");
    throw new PlannerClientError("SERVICE_UNAVAILABLE", "The planning service could not be reached.");
  }

  if (response.status === 401 || response.status === 403) throw new PlannerClientError("UNAUTHORIZED", "The planning service rejected server authentication.", response.status);
  if (response.status === 408 || response.status === 504) throw new PlannerClientError("TIMEOUT", "The planning service reached its time limit. Try a shorter planning range.", response.status);
  if (response.status === 422) {
    // The planner's validation handler omits rejected values. Preserve only field
    // paths and expose no user content, task IDs, credentials, or raw error body.
    let validationPaths: string[] = [];
    try {
      const body: unknown = await response.json();
      const issues = z.object({ issues: z.array(z.object({ location: z.array(z.union([z.string(), z.number()])) }).passthrough()).optional() }).passthrough().safeParse(body);
      if (issues.success) {
        validationPaths = [...new Set((issues.data.issues ?? []).map(({ location }) => location
          .filter((part) => typeof part === "number" || /^[A-Za-z][A-Za-z0-9]*$/.test(part))
          .slice(1).join(".")))].filter(Boolean).slice(0, 8);
      }
    } catch { /* Keep the generic safe validation error if the body is unavailable. */ }
    throw new PlannerClientError("INVALID_REQUEST", "The planning service rejected the planning request.", response.status, validationPaths);
  }
  if (response.status === 503) throw new PlannerClientError("SERVICE_UNAVAILABLE", "The planning service is temporarily unavailable.", response.status);
  if (response.status >= 500) throw new PlannerClientError("SOLVER_FAILURE", "The planning service could not generate a proposal.", response.status);
  if (!response.ok) throw new PlannerClientError("SERVICE_UNAVAILABLE", "The planning service returned an unexpected response.", response.status);

  let payload: unknown;
  try { payload = await response.json(); }
  catch { throw new PlannerClientError("INVALID_RESPONSE", "The planning service returned invalid JSON.", response.status); }
  const parsed = proposalSchema.safeParse(payload);
  if (!parsed.success) throw new PlannerClientError("INVALID_RESPONSE", "The planning service returned data that did not match its contract.", response.status);
  if (parsed.data.solverStatus === "INFEASIBLE" || parsed.data.solverStatus === "ERROR") {
    throw new PlannerClientError("SOLVER_FAILURE", "The planning service did not produce a valid proposal.", response.status);
  }
  return parsed.data;
}
