/**
 * Michael's quality report, for the team (Phase 6). Two sources:
 *
 *  1. Outcomes: what people did with what Michael offered, from `OutcomeEvent`,
 *     over the last N days (default 30). Aggregate counts and rates only —
 *     no user, organization, record or content ever appears.
 *  2. Answer quality: the newest live evaluation report in
 *     services/intelligence/evals/reports/ (from `npm run eval:live`), if any.
 *
 *     npm run report:quality            # last 30 days
 *     npm run report:quality -- 7       # last 7 days
 */
import dotenv from "dotenv";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "../src/generated/prisma/client";

dotenv.config({ path: ".env.local" });
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not configured locally.");
const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString }) });
const days = Math.max(1, Math.min(365, Number(process.argv[2] ?? 30) || 30));
const since = new Date(Date.now() - days * 86_400_000);

const pct = (part: number, whole: number) => (whole === 0 ? "—" : `${Math.round((part / whole) * 100)}%`);

try {
  const rows = await prisma.outcomeEvent.groupBy({ by: ["kind", "subject"], where: { recordedAt: { gte: since } }, _count: { _all: true } });
  const count = (kind: string, subject?: string) => rows.filter((row) => row.kind === kind && (!subject || row.subject === subject)).reduce((sum, row) => sum + row._count._all, 0);
  const subjects = (kind: string) => [...new Set(rows.filter((row) => row.kind === kind).map((row) => row.subject))].sort();

  console.log(`Michael quality report — last ${days} days (since ${since.toISOString().slice(0, 10)})\n`);
  console.log("Drafts (saved / decided)");
  const draftKinds = [...new Set([...subjects("DRAFT_SAVED"), ...subjects("DRAFT_DISCARDED")])];
  if (draftKinds.length === 0) console.log("  no drafts decided yet");
  for (const kind of draftKinds) {
    const saved = count("DRAFT_SAVED", kind); const discarded = count("DRAFT_DISCARDED", kind);
    console.log(`  ${kind.padEnd(20)} ${String(saved).padStart(4)} saved  ${String(discarded).padStart(4)} discarded   save rate ${pct(saved, saved + discarded)}`);
  }
  const shown = count("SUGGESTION_SHOWN"); const confirmed = count("SUGGESTION_CONFIRMED"); const dismissed = count("SUGGESTION_DISMISSED");
  console.log(`\nCategory suggestions\n  ${shown} shown · ${confirmed} confirmed · ${dismissed} dismissed · confirm rate ${pct(confirmed, shown)} · dismiss rate ${pct(dismissed, shown)}`);
  const kept = count("PLAN_SESSION_KEPT"); const removed = count("PLAN_SESSION_DESELECTED");
  console.log(`\nPlanned sessions\n  ${kept} kept · ${removed} removed · keep rate ${pct(kept, kept + removed)}`);
  const accepted = count("PROPOSAL_ACCEPTED"); const declined = count("PROPOSAL_DISMISSED");
  console.log(`\nPreference proposals\n  ${accepted} applied · ${declined} dismissed · apply rate ${pct(accepted, accepted + declined)}`);

  const reports = path.join("services", "intelligence", "evals", "reports");
  const newest = existsSync(reports) ? readdirSync(reports).filter((name) => name.endsWith(".json")).sort().at(-1) : undefined;
  if (!newest) {
    console.log("\nAnswer quality\n  no live evaluation yet — run `npm run eval:live`");
  } else {
    const report = JSON.parse(readFileSync(path.join(reports, newest), "utf8")) as { dataset: string; provider: string; model: string; summary: { passed: number; cases: number; passRate: number; byArea: Record<string, string>; secondsP50: number; secondsP90: number }; cases: Array<{ case_id: string; passed: boolean; failures: string[] }> };
    const { summary } = report;
    console.log(`\nAnswer quality (${newest})\n  ${report.dataset} on ${report.provider}:${report.model} — ${summary.passed}/${summary.cases} passed (${Math.round(summary.passRate * 100)}%) · p50 ${summary.secondsP50}s · p90 ${summary.secondsP90}s`);
    console.log(`  by area: ${Object.entries(summary.byArea).map(([area, score]) => `${area} ${score}`).join(" · ")}`);
    for (const failed of report.cases.filter((item) => !item.passed)) console.log(`  FAIL ${failed.case_id}: ${failed.failures.join("; ")}`);
  }
} finally {
  await prisma.$disconnect();
}
