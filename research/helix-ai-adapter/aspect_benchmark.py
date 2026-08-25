#!/usr/bin/env python3
"""Detached benchmark for the narrow ``interpretAspect(text)`` experiment.

This is intentionally separate from benchmark.py and production-settings-v1.
It calls only the local OpenAI-compatible inference endpoint.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import statistics
import subprocess
import sys
import time
import urllib.error
import urllib.request
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent
DEFAULT_CASES = ROOT / "cases" / "aspect-v1.json"
DEFAULT_RESULTS_DIR = ROOT / "results"
PROMPT_VERSION = "interpret-aspect-v1"
SUPPORTED_ASPECTS = ["1:1", "2:3", "3:2", "3:4", "4:3", "9:16", "16:9", "21:9"]

SYSTEM_PROMPT = """Interpret only an explicit request to set a Helix video's aspect ratio.
Return JSON only.

A match must be an instruction about the output video's frame/aspect/format, not creative scene content.
Supported values are exactly: 1:1, 2:3, 3:2, 3:4, 4:3, 9:16, 16:9, 21:9.
Map vertical or portrait video to 9:16; landscape or widescreen to 16:9; square to 1:1; ultrawide or cinematic-wide to 21:9.
An exact supported ratio overrides an alias. A final correction introduced by actually, instead, scratch that, or "no" replaces the earlier request.
If there is no explicit aspect-setting request, a request is negated without a replacement, values conflict without a correction, or the requested aspect is unsupported or vague, return matched false and value null. Do not guess from nouns or descriptive prompt text."""

RESPONSE_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "matched": {"type": "boolean"},
        "value": {"type": ["string", "null"], "enum": [*SUPPORTED_ASPECTS, None]},
    },
    "required": ["matched", "value"],
    "additionalProperties": False,
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--endpoint", default="http://127.0.0.1:8181")
    parser.add_argument("--model", default="helix-qwen3-0.6b")
    parser.add_argument("--cases", type=Path, default=DEFAULT_CASES)
    parser.add_argument("--repeat", type=int, default=1)
    parser.add_argument("--timeout", type=float, default=20.0)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--only-category")
    parser.add_argument("--only-id")
    parser.add_argument("--show-passes", action="store_true")
    return parser.parse_args()


def request_json(url: str, payload: dict[str, Any] | None, timeout: float) -> dict[str, Any]:
    request = urllib.request.Request(
        url,
        data=None if payload is None else json.dumps(payload).encode("utf-8"),
        headers={} if payload is None else {"Content-Type": "application/json"},
        method="GET" if payload is None else "POST",
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


def percentile(values: list[float], quantile: float) -> float:
    ordered = sorted(values)
    if not ordered:
        return 0.0
    position = (len(ordered) - 1) * quantile
    low, high = math.floor(position), math.ceil(position)
    if low == high:
        return ordered[low]
    return ordered[low] + (ordered[high] - ordered[low]) * (position - low)


def git_commit() -> str:
    try:
        return subprocess.check_output(
            ["git", "rev-parse", "HEAD"], cwd=ROOT, text=True, stderr=subprocess.DEVNULL
        ).strip()
    except (OSError, subprocess.CalledProcessError):
        return "unknown"


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def load_cases(path: Path, args: argparse.Namespace) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    fixture = json.loads(path.read_text(encoding="utf-8"))
    cases = [
        case for case in fixture["cases"]
        if (not args.only_category or case["category"] == args.only_category)
        and (not args.only_id or case["id"] == args.only_id)
    ]
    if not cases:
        raise SystemExit("No cases matched the requested filters")
    return fixture, cases


def call_case(args: argparse.Namespace, case: dict[str, Any]) -> dict[str, Any]:
    payload = {
        "model": args.model,
        "temperature": 0,
        "max_tokens": 32,
        "reasoning_effort": "none",
        "response_format": {"type": "json_schema", "json_schema": {"name": "helix_interpret_aspect", "schema": RESPONSE_SCHEMA}},
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": json.dumps({"text": case["text"]}, separators=(",", ":"))},
        ],
    }
    started = time.perf_counter()
    try:
        response = request_json(f"{args.endpoint.rstrip('/')}/v1/chat/completions", payload, args.timeout)
        wall_ms = (time.perf_counter() - started) * 1000
        content = response["choices"][0]["message"]["content"]
        got = json.loads(content)
        error = None
    except Exception as exc:
        response, content, got = None, None, None
        wall_ms = (time.perf_counter() - started) * 1000
        error = f"{type(exc).__name__}: {exc}"
    timings = response.get("timings", {}) if isinstance(response, dict) else {}
    return {
        "id": case["id"], "category": case["category"], "text": case["text"],
        "expected": case["expected"], "got": got, "rawContent": content,
        "exact": got == case["expected"],
        "wallMs": wall_ms, "promptMs": timings.get("prompt_ms"),
        "generationMs": timings.get("predicted_ms"),
        "generationTokensPerSecond": timings.get("predicted_per_second"), "error": error,
    }


def summarize(records: list[dict[str, Any]]) -> dict[str, Any]:
    total = len(records)
    correct = sum(record["exact"] for record in records)
    positives = [record for record in records if record["expected"]["matched"]]
    negatives = [record for record in records if not record["expected"]["matched"]]
    matched = [record for record in records if isinstance(record["got"], dict) and record["got"].get("matched")]
    correct_positive_values = sum(
        isinstance(record["got"], dict) and record["got"].get("value") == record["expected"]["value"]
        for record in positives
    )
    false_positives = sum(record["got"] != record["expected"] for record in negatives)
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for record in records:
        grouped[record["category"]].append(record)
    categories = {
        category: {"correct": sum(item["exact"] for item in items), "total": len(items),
                   "accuracy": sum(item["exact"] for item in items) / len(items)}
        for category, items in sorted(grouped.items())
    }
    latencies = [record["wallMs"] for record in records]
    return {
        "exactCorrect": correct, "total": total, "exactAccuracy": correct / total,
        "schemaValidity": sum(record["error"] is None and isinstance(record["got"], dict) for record in records) / total,
        "matchPrecision": correct_positive_values / len(matched) if matched else 1.0,
        "matchRecall": correct_positive_values / len(positives) if positives else 1.0,
        "falsePositives": false_positives, "negativeTotal": len(negatives),
        "falsePositiveRate": false_positives / len(negatives) if negatives else 0.0,
        "latencyP50Ms": percentile(latencies, .5), "latencyP95Ms": percentile(latencies, .95),
        "latencyMeanMs": statistics.mean(latencies), "categories": categories,
    }


def main() -> int:
    args = parse_args()
    if args.repeat < 1:
        raise SystemExit("--repeat must be at least 1")
    fixture, cases = load_cases(args.cases, args)
    try:
        health = request_json(f"{args.endpoint.rstrip('/')}/health", None, args.timeout)
    except (OSError, urllib.error.URLError, TimeoutError) as exc:
        raise SystemExit(f"helixai-adapter is unavailable: {exc}") from exc
    if health.get("status") != "ok":
        raise SystemExit(f"helixai-adapter health is not ok: {health}")
    print(f"Running {len(cases)} cases x {args.repeat} repeat(s) against {args.model} at {args.endpoint}", flush=True)
    records = []
    for case in cases:
        for repeat in range(1, args.repeat + 1):
            record = call_case(args, case)
            record["repeat"] = repeat
            records.append(record)
        print(f"{case['id']}: {'PASS' if records[-1]['exact'] else 'FAIL'}", flush=True)
    summary = summarize(records)
    print("\nHELIX QWEN INTERPRET ASPECT BENCHMARK\n" + "=" * 72)
    print(f"Exact accuracy:       {summary['exactCorrect']}/{summary['total']} ({summary['exactAccuracy']:.1%})")
    print(f"Schema validity:      {summary['schemaValidity']:.1%}")
    print(f"Match precision:      {summary['matchPrecision']:.1%}")
    print(f"Match recall:         {summary['matchRecall']:.1%}")
    print(f"Negative FP:          {summary['falsePositives']}/{summary['negativeTotal']} ({summary['falsePositiveRate']:.1%})")
    print(f"Latency p50 / p95:    {summary['latencyP50Ms']:.0f} / {summary['latencyP95Ms']:.0f} ms")
    print("\nBY CATEGORY")
    for category, values in summary["categories"].items():
        print(f"  {category:24} {values['correct']:>2}/{values['total']:<2} ({values['accuracy']:.1%})")
    display = records if args.show_passes else [record for record in records if not record["exact"]]
    if display:
        print("\n" + ("ALL CASES" if args.show_passes else "FAILURES") + "\n" + "-" * 72)
        for record in display:
            label = "PASS" if record["exact"] else "FAIL"
            print(f"[{label}] {record['id']} ({record['category']}) — {record['text']}")
            if not record["exact"]:
                print("  expected:", json.dumps(record["expected"], separators=(",", ":")))
                print("  got:     ", json.dumps(record["got"], separators=(",", ":")))
                if record["error"]:
                    print("  error:   ", record["error"])
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    output = args.output or DEFAULT_RESULTS_DIR / f"aspect-v1-{timestamp}.json"
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps({"metadata": {
        "createdAt": datetime.now(timezone.utc).isoformat(), "gitCommit": git_commit(),
        "fixtureVersion": fixture.get("version"), "fixtureSha256": sha256(args.cases),
        "promptVersion": PROMPT_VERSION, "model": args.model, "endpoint": args.endpoint,
        "repeat": args.repeat, "systemPrompt": SYSTEM_PROMPT, "responseSchema": RESPONSE_SCHEMA,
    }, "summary": summary, "records": records}, indent=2) + "\n", encoding="utf-8")
    print(f"\nRaw result: {output}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
