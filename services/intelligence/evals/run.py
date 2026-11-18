"""Run Michael's evaluation cases against the configured provider.

    npm run eval:live                       # every case, provider from services/intelligence/.env
    npm run eval:live -- --case memory.     # cases whose id starts with "memory."

Prints one line per case and a summary, and writes the full report to
evals/reports/<dataset>-<provider>-<timestamp>.json (not committed). Uses only
the dataset's fixed data: no database, no user data, no server.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import sys
import time
from dataclasses import asdict
from pathlib import Path

from dotenv import load_dotenv

from app.config import limits, provider_settings
from app.providers.factory import create_provider
from evals.harness import load, run_case, summarize

REPORTS = Path(__file__).parent / "reports"


async def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--dataset", default="michael-v1")
    parser.add_argument("--case", default="", help="only cases whose id starts with this")
    args = parser.parse_args()
    load_dotenv(Path(__file__).parents[1] / ".env")
    settings = provider_settings()
    provider = create_provider(settings)
    dataset = load(args.dataset)
    cases = [case for case in dataset.cases if case.id.startswith(args.case)]
    print(f"{dataset.version}: {len(cases)} cases on {settings.provider}:{settings.model}\n")
    outcomes = []
    for case in cases:
        outcome = await run_case(case, provider, settings, limits(settings.provider))
        outcomes.append(outcome)
        print(f"{'PASS' if outcome.passed else 'FAIL'} {outcome.seconds:5.1f}s {case.id}  tools={','.join(outcome.tools) or '-'}")
        if not outcome.passed:
            print(f"      {'; '.join(outcome.failures)}\n      answer: {outcome.answer.replace(chr(10), ' ')[:240]}")
    summary = summarize(outcomes)
    print(f"\n{summary['passed']}/{summary['cases']} passed ({summary['passRate']:.0%}) · by area {summary['byArea']} · p50 {summary['secondsP50']}s p90 {summary['secondsP90']}s")
    REPORTS.mkdir(exist_ok=True)
    report = REPORTS / f"{dataset.version}-{settings.provider}-{time.strftime('%Y%m%d-%H%M%S')}.json"
    report.write_text(json.dumps({"dataset": dataset.version, "provider": settings.provider, "model": settings.model,
                                  "summary": summary, "cases": [asdict(outcome) for outcome in outcomes]}, indent=2), encoding="utf-8")
    print(f"Report: {report}")
    return 0 if summary["passed"] == summary["cases"] else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
