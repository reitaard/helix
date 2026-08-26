#!/usr/bin/env python3
"""Detached benchmarks for narrow Helix Production research use cases.

The script calls only an OpenAI-compatible inference endpoint. It does not import
or call media-runtime, Telegram, PostgreSQL, ComfyUI, or job execution code.
Each task has an independent prompt, fixture, response schema, and score.
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
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent
RESULTS = ROOT / "results"

TASKS: dict[str, dict[str, Any]] = {
    "exact-physics-risk": {
        "fixture": ROOT / "cases" / "exact-physics-risk-v1.json",
        "promptVersion": "detect-exact-physics-risk-v1",
        "systemPrompt": """Classify one text-to-video prompt for a specific Production risk.
Return JSON only as {\"matched\":true} or {\"matched\":false}.

matched=true only when successful execution depends on at least one of:
- exact collision geometry or a precise multi-object physical chain;
- exact mirror/reflection geometry across a changing viewpoint;
- an irreversible physical state change that must remain exact afterward, such as an object shattering, burning away, melting, or being cut apart without reforming.

Ordinary movement, camera motion, one simple bounce, visual words such as reflective or impactful, and vague requests for realistic physics are false. A negated requirement is false unless a later correction explicitly restores a qualifying requirement. Judge the requested video behavior, not isolated keywords.""",
        "schemaName": "helix_detect_exact_physics_risk",
        "schema": {
            "type": "object",
            "properties": {"matched": {"type": "boolean"}},
            "required": ["matched"],
            "additionalProperties": False,
        },
        "labelKey": "matched",
        "labels": [False, True],
    },
    "error-family": {
        "fixture": ROOT / "cases" / "error-family-v1.json",
        "promptVersion": "classify-runtime-error-family-v1",
        "systemPrompt": """Classify one Helix runtime event into one error family. Return JSON only.

Families:
- worker_unreachable: the worker/Comfy endpoint or adapter cannot be contacted or is unavailable.
- submission_rejected: workflow binding or Comfy /prompt validation/submission failed before execution was accepted.
- execution_failed: Comfy accepted the prompt but generation/node execution failed.
- timed_out: eventType or status explicitly says the running job timed out; this takes precedence.
- delivery_failed: artifact metadata, download/spool/probe, Telegram document send, or terminal delivery failed.
- database: PostgreSQL connectivity, relation, query, or constraint failure.
- unknown: insufficient information, a successful/non-error event, cancellation, retry notice, or another family.

Use the whole event object. Classify the underlying worker cause as worker_unreachable even if it occurred during delivery. Do not invent a cause from \"Unknown error\".""",
        "schemaName": "helix_classify_runtime_error",
        "schema": {
            "type": "object",
            "properties": {"family": {"type": "string", "enum": [
                "worker_unreachable", "submission_rejected", "execution_failed",
                "timed_out", "delivery_failed", "database", "unknown"
            ]}},
            "required": ["family"],
            "additionalProperties": False,
        },
        "labelKey": "family",
        "labels": ["worker_unreachable", "submission_rejected", "execution_failed", "timed_out", "delivery_failed", "database", "unknown"],
    },
    "shot-structure": {
        "fixture": ROOT / "cases" / "shot-structure-v1.json",
        "promptVersion": "interpret-shot-structure-v1",
        "systemPrompt": """Interpret only the explicitly requested editing/shot structure of a text-to-video prompt. Return JSON only.

structure=single when the text explicitly requires one shot/take, continuous/uninterrupted filming, or no cuts.
structure=multi when it explicitly requires multiple shots, cuts, a montage, alternating angles, or a transition to a distinct shot.
structure=unclear when structure is merely implied, unspecified, creative words resemble editing terms, or single and multi requirements remain contradictory.
A clear final correction introduced by actually, instead, or \"no\" replaces the earlier structure. Do not infer multiple shots merely because several actions, places, or times are mentioned.""",
        "schemaName": "helix_interpret_shot_structure",
        "schema": {
            "type": "object",
            "properties": {"structure": {"type": "string", "enum": ["single", "multi", "unclear"]}},
            "required": ["structure"],
            "additionalProperties": False,
        },
        "labelKey": "structure",
        "labels": ["single", "multi", "unclear"],
    },
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--task", choices=sorted(TASKS), required=True)
    parser.add_argument("--endpoint", default="http://127.0.0.1:8181")
    parser.add_argument("--model", default="helix-qwen3-0.6b")
    parser.add_argument("--cases", type=Path)
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
    if not values:
        return 0.0
    ordered = sorted(values)
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


def valid_result(value: Any, config: dict[str, Any]) -> bool:
    key = config["labelKey"]
    return isinstance(value, dict) and set(value) == {key} and value[key] in config["labels"]


def load_cases(path: Path, args: argparse.Namespace) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    fixture = json.loads(path.read_text(encoding="utf-8"))
    selected = [
        case for case in fixture["cases"]
        if (not args.only_category or case["category"] == args.only_category)
        and (not args.only_id or case["id"] == args.only_id)
    ]
    if not selected:
        raise SystemExit("No cases matched the requested filters")
    return fixture, selected


def call_case(args: argparse.Namespace, config: dict[str, Any], case: dict[str, Any]) -> dict[str, Any]:
    payload = {
        "model": args.model,
        "temperature": 0,
        "max_tokens": 32,
        "reasoning_effort": "none",
        "response_format": {"type": "json_schema", "json_schema": {
            "name": config["schemaName"], "schema": config["schema"]
        }},
        "messages": [
            {"role": "system", "content": config["systemPrompt"]},
            {"role": "user", "content": json.dumps(case["input"], separators=(",", ":"))},
        ],
    }
    started = time.perf_counter()
    try:
        response = request_json(f"{args.endpoint.rstrip('/')}/v1/chat/completions", payload, args.timeout)
        wall_ms = (time.perf_counter() - started) * 1000
        raw = response["choices"][0]["message"]["content"]
        got = json.loads(raw)
        error = None if valid_result(got, config) else "SchemaValidationError: response does not match task contract"
    except Exception as exc:
        response, raw, got = None, None, None
        wall_ms = (time.perf_counter() - started) * 1000
        error = f"{type(exc).__name__}: {exc}"
    timings = response.get("timings", {}) if isinstance(response, dict) else {}
    return {
        "id": case["id"], "category": case["category"], "input": case["input"],
        "expected": case["expected"], "got": got, "rawContent": raw,
        "exact": got == case["expected"], "valid": error is None,
        "wallMs": wall_ms, "promptMs": timings.get("prompt_ms"),
        "generationMs": timings.get("predicted_ms"),
        "generationTokensPerSecond": timings.get("predicted_per_second"), "error": error,
    }


def summarize(records: list[dict[str, Any]], config: dict[str, Any]) -> dict[str, Any]:
    total = len(records)
    key = config["labelKey"]
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    confusion: Counter[tuple[str, str]] = Counter()
    for record in records:
        grouped[record["category"]].append(record)
        expected_label = str(record["expected"][key])
        got_label = str(record["got"].get(key)) if valid_result(record["got"], config) else "INVALID"
        confusion[(expected_label, got_label)] += 1
    latencies = [record["wallMs"] for record in records]
    exact = sum(record["exact"] for record in records)
    by_id: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for record in records:
        by_id[record["id"]].append(record)
    consistent = sum(
        len({json.dumps(item["got"], sort_keys=True) for item in items}) == 1
        for items in by_id.values()
    )
    binary = config["labels"] == [False, True]
    false_positives = sum(
        record["expected"][key] is False
        and valid_result(record["got"], config)
        and record["got"][key] is True
        for record in records
    ) if binary else None
    negatives = sum(record["expected"][key] is False for record in records) if binary else None
    false_negatives = sum(
        record["expected"][key] is True
        and (not valid_result(record["got"], config) or record["got"][key] is False)
        for record in records
    ) if binary else None
    positives = sum(record["expected"][key] is True for record in records) if binary else None
    return {
        "exactCorrect": exact, "total": total, "exactAccuracy": exact / total,
        "validResponses": sum(record["valid"] for record in records),
        "schemaValidity": sum(record["valid"] for record in records) / total,
        "repeatConsistentCases": consistent, "uniqueCases": len(by_id),
        "repeatConsistency": consistent / len(by_id),
        "falsePositives": false_positives, "negativeTotal": negatives,
        "falsePositiveRate": false_positives / negatives if binary and negatives else None,
        "falseNegatives": false_negatives, "positiveTotal": positives,
        "falseNegativeRate": false_negatives / positives if binary and positives else None,
        "latencyP50Ms": percentile(latencies, 0.50), "latencyP95Ms": percentile(latencies, 0.95),
        "latencyMeanMs": statistics.mean(latencies),
        "categories": {
            category: {"correct": sum(item["exact"] for item in items), "total": len(items),
                       "accuracy": sum(item["exact"] for item in items) / len(items)}
            for category, items in sorted(grouped.items())
        },
        "confusion": [
            {"expected": expected, "got": got, "count": count}
            for (expected, got), count in sorted(confusion.items())
        ],
    }


def main() -> int:
    if (ROOT / "RESEARCH_LOCKED").exists():
        raise SystemExit("Research is postponed and locked; see RESEARCH_LOCK.md")

    args = parse_args()
    if args.repeat < 1:
        raise SystemExit("--repeat must be at least 1")
    config = TASKS[args.task]
    cases_path = args.cases or config["fixture"]
    fixture, cases = load_cases(cases_path, args)
    try:
        health = request_json(f"{args.endpoint.rstrip('/')}/health", None, args.timeout)
    except (OSError, urllib.error.URLError, TimeoutError) as exc:
        raise SystemExit(f"inference endpoint is unavailable: {exc}") from exc
    if health.get("status") != "ok":
        raise SystemExit(f"inference endpoint health is not ok: {health}")

    print(f"Task {args.task}: {len(cases)} cases x {args.repeat} repeat(s) against {args.model}", flush=True)
    records: list[dict[str, Any]] = []
    for case in cases:
        for repeat in range(1, args.repeat + 1):
            record = call_case(args, config, case)
            record["repeat"] = repeat
            records.append(record)
        print(f"{case['id']}: {'PASS' if records[-1]['exact'] else 'FAIL'}", flush=True)

    summary = summarize(records, config)
    print(f"\nHELIX DETACHED {args.task.upper()} BENCHMARK\n" + "=" * 72)
    print(f"Exact accuracy:       {summary['exactCorrect']}/{summary['total']} ({summary['exactAccuracy']:.1%})")
    print(f"Schema validity:      {summary['schemaValidity']:.1%}")
    print(f"Repeat consistency:   {summary['repeatConsistency']:.1%}")
    if summary["falsePositiveRate"] is not None:
        print(f"False-positive rate:  {summary['falsePositives']}/{summary['negativeTotal']} ({summary['falsePositiveRate']:.1%})")
        print(f"False-negative rate:  {summary['falseNegatives']}/{summary['positiveTotal']} ({summary['falseNegativeRate']:.1%})")
    print(f"Latency p50 / p95:    {summary['latencyP50Ms']:.0f} / {summary['latencyP95Ms']:.0f} ms")
    print("\nBY CATEGORY")
    for category, values in summary["categories"].items():
        print(f"  {category:24} {values['correct']:>2}/{values['total']:<2} ({values['accuracy']:.1%})")

    display = records if args.show_passes else [record for record in records if not record["exact"]]
    if display:
        print("\n" + ("ALL CASES" if args.show_passes else "FAILURES") + "\n" + "-" * 72)
        for record in display:
            label = "PASS" if record["exact"] else "FAIL"
            print(f"[{label}] {record['id']} ({record['category']})")
            if not record["exact"]:
                print("  input:   ", json.dumps(record["input"], separators=(",", ":")))
                print("  expected:", json.dumps(record["expected"], separators=(",", ":")))
                print("  got:     ", json.dumps(record["got"], separators=(",", ":")))
                if record["error"]:
                    print("  error:   ", record["error"])

    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    safe_model = "".join(character if character.isalnum() or character in "._-" else "-" for character in args.model)
    output = args.output or RESULTS / f"{fixture['version']}-{safe_model}-{timestamp}.json"
    output.parent.mkdir(parents=True, exist_ok=True)
    result = {"metadata": {
        "createdAt": datetime.now(timezone.utc).isoformat(), "gitCommit": git_commit(),
        "task": args.task, "fixtureVersion": fixture["version"],
        "fixtureSha256": hashlib.sha256(cases_path.read_bytes()).hexdigest(),
        "promptVersion": config["promptVersion"], "model": args.model, "endpoint": args.endpoint,
        "repeat": args.repeat, "systemPrompt": config["systemPrompt"], "responseSchema": config["schema"],
    }, "summary": summary, "records": records}
    output.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(f"\nRaw result: {output}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
