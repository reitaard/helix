#!/usr/bin/env python3
"""Compare Qwen3-0.6B inference configurations on frozen Helix fixtures.

This detached runner changes only inference configuration. Existing fixtures,
system prompts, schemas, and gold expectations are imported unchanged from the
V1 runners. The optional few-shot profile adds separate, disclosed examples.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import statistics
import subprocess
import time
import urllib.request
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import aspect_benchmark
import use_case_benchmark

ROOT = Path(__file__).resolve().parent
RESULTS = ROOT / "results"

PROFILES: dict[str, dict[str, Any]] = {
    "deterministic-nonthinking": {
        "endpoint": "http://127.0.0.1:8181",
        "model": "helix-qwen3-0.6b",
        "temperature": 0,
        "top_p": 1.0,
        "top_k": 0,
        "max_tokens": 32,
        "reasoning_effort": "none",
        "few_shot": False,
    },
    "official-nonthinking": {
        "endpoint": "http://127.0.0.1:8181",
        "model": "helix-qwen3-0.6b",
        "temperature": 0.7,
        "top_p": 0.8,
        "top_k": 20,
        "max_tokens": 32,
        "reasoning_effort": "none",
        "few_shot": False,
    },
    "official-thinking-64": {
        "endpoint": "http://127.0.0.1:8182",
        "model": "helix-qwen3-0.6b-thinking",
        "temperature": 0.6,
        "top_p": 0.95,
        "top_k": 20,
        "max_tokens": 128,
        "reasoning_effort": "default",
        "few_shot": False,
        "server_reasoning_budget": 64,
    },
    "thinking-64-few-shot": {
        "endpoint": "http://127.0.0.1:8182",
        "model": "helix-qwen3-0.6b-thinking",
        "temperature": 0.6,
        "top_p": 0.95,
        "top_k": 20,
        "max_tokens": 128,
        "reasoning_effort": "default",
        "few_shot": True,
        "server_reasoning_budget": 64,
    },
}

FEW_SHOTS: dict[str, list[tuple[Any, dict[str, Any]]]] = {
    "aspect": [
        ({"text": "Format the output as vertical video."}, {"matched": True, "value": "9:16"}),
        ({"text": "A portrait of a violinist beside a window."}, {"matched": False, "value": None}),
        ({"text": "Use 4:5 framing."}, {"matched": False, "value": None}),
        ({"text": "Make it square—actually use widescreen."}, {"matched": True, "value": "16:9"}),
    ],
    "exact-physics-risk": [
        ({"prompt": "Two gears must collide at exact teeth and transfer motion through three linked parts."}, {"matched": True}),
        ({"prompt": "A dramatic and impactful portrait with ordinary camera movement."}, {"matched": False}),
        ({"prompt": "Do not show the glass shattering; it stays whole."}, {"matched": False}),
    ],
    "error-family": [
        ({"eventType": "worker_request_failed", "message": "ECONNREFUSED connecting to Comfy"}, {"family": "worker_unreachable"}),
        ({"eventType": "submission_failed", "message": "/prompt rejected workflow validation before prompt id"}, {"family": "submission_rejected"}),
        ({"eventType": "job_succeeded", "message": "Generation complete"}, {"family": "unknown"}),
    ],
    "shot-structure": [
        ({"text": "One uninterrupted take with no cuts."}, {"structure": "single"}),
        ({"text": "Cut between a wide shot and a reverse angle."}, {"structure": "multi"}),
        ({"text": "Morning becomes night while the dancer turns."}, {"structure": "unclear"}),
    ],
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--task", choices=["aspect", *sorted(use_case_benchmark.TASKS)], required=True)
    parser.add_argument("--profile", choices=sorted(PROFILES), required=True)
    parser.add_argument("--repeat", type=int, default=3)
    parser.add_argument("--timeout", type=float, default=90.0)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--only-category")
    parser.add_argument("--only-id")
    return parser.parse_args()


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def git_commit() -> str:
    return subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip()


def percentile(values: list[float], quantile: float) -> float:
    ordered = sorted(values)
    if not ordered:
        return 0.0
    position = (len(ordered) - 1) * quantile
    low, high = math.floor(position), math.ceil(position)
    if low == high:
        return ordered[low]
    return ordered[low] + (ordered[high] - ordered[low]) * (position - low)


def task_config(task: str) -> dict[str, Any]:
    if task == "aspect":
        return {
            "fixture": aspect_benchmark.DEFAULT_CASES,
            "promptVersion": aspect_benchmark.PROMPT_VERSION,
            "systemPrompt": aspect_benchmark.SYSTEM_PROMPT,
            "schemaName": "helix_interpret_aspect",
            "schema": aspect_benchmark.RESPONSE_SCHEMA,
            "labelKey": "value",
        }
    config = use_case_benchmark.TASKS[task]
    return {**config, "fixture": Path(config["fixture"])}


def valid_result(task: str, got: Any, config: dict[str, Any]) -> bool:
    if task == "aspect":
        return (
            isinstance(got, dict)
            and set(got) == {"matched", "value"}
            and isinstance(got["matched"], bool)
            and got["value"] in [*aspect_benchmark.SUPPORTED_ASPECTS, None]
            and got["matched"] == (got["value"] is not None)
        )
    return use_case_benchmark.valid_result(got, config)


def messages(task: str, config: dict[str, Any], case_input: Any, few_shot: bool) -> list[dict[str, str]]:
    result = [{"role": "system", "content": config["systemPrompt"]}]
    if few_shot:
        for example_input, expected in FEW_SHOTS[task]:
            result.extend([
                {"role": "user", "content": json.dumps(example_input, separators=(",", ":"))},
                {"role": "assistant", "content": json.dumps(expected, separators=(",", ":"))},
            ])
    result.append({"role": "user", "content": json.dumps(case_input, separators=(",", ":"))})
    return result


def call(task: str, profile: dict[str, Any], config: dict[str, Any], case: dict[str, Any]) -> dict[str, Any]:
    case_input = {"text": case["text"]} if task == "aspect" else case["input"]
    payload = {
        "model": profile["model"],
        "temperature": profile["temperature"],
        "top_p": profile["top_p"],
        "top_k": profile["top_k"],
        "max_tokens": profile["max_tokens"],
        "reasoning_effort": profile["reasoning_effort"],
        "response_format": {"type": "json_schema", "json_schema": {
            "name": config["schemaName"], "schema": config["schema"]
        }},
        "messages": messages(task, config, case_input, profile["few_shot"]),
    }
    request = urllib.request.Request(
        f"{profile['endpoint']}/v1/chat/completions",
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"},
    )
    started = time.perf_counter()
    response = raw = got = None
    try:
        with urllib.request.urlopen(request, timeout=ARGS.timeout) as opened:
            response = json.load(opened)
        raw = response["choices"][0]["message"]["content"]
        got = json.loads(raw)
        error = None if valid_result(task, got, config) else "SchemaValidationError"
    except Exception as exc:
        error = f"{type(exc).__name__}: {exc}"
    wall_ms = (time.perf_counter() - started) * 1000
    message = response["choices"][0]["message"] if isinstance(response, dict) else {}
    return {
        "id": case["id"], "category": case["category"], "input": case_input,
        "expected": case["expected"], "got": got, "rawContent": raw,
        "reasoningContent": message.get("reasoning_content"),
        "exact": got == case["expected"], "valid": error is None,
        "wallMs": wall_ms, "error": error,
    }


def summarize(task: str, records: list[dict[str, Any]]) -> dict[str, Any]:
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    by_id: dict[str, list[dict[str, Any]]] = defaultdict(list)
    confusion: Counter[tuple[str, str]] = Counter()
    for record in records:
        grouped[record["category"]].append(record)
        by_id[record["id"]].append(record)
        expected = json.dumps(record["expected"], sort_keys=True)
        got = json.dumps(record["got"], sort_keys=True) if record["got"] is not None else "INVALID"
        confusion[(expected, got)] += 1
    latencies = [record["wallMs"] for record in records]
    summary = {
        "exactCorrect": sum(record["exact"] for record in records),
        "total": len(records),
        "exactAccuracy": sum(record["exact"] for record in records) / len(records),
        "schemaValidity": sum(record["valid"] for record in records) / len(records),
        "repeatConsistentCases": sum(
            len({json.dumps(item["got"], sort_keys=True) for item in items}) == 1
            for items in by_id.values()
        ),
        "uniqueCases": len(by_id),
        "repeatConsistency": sum(
            len({json.dumps(item["got"], sort_keys=True) for item in items}) == 1
            for items in by_id.values()
        ) / len(by_id),
        "latencyP50Ms": percentile(latencies, 0.5),
        "latencyP95Ms": percentile(latencies, 0.95),
        "latencyMeanMs": statistics.mean(latencies),
        "categories": {
            category: {
                "correct": sum(item["exact"] for item in items),
                "total": len(items),
                "accuracy": sum(item["exact"] for item in items) / len(items),
            }
            for category, items in sorted(grouped.items())
        },
        "confusion": [
            {"expected": expected, "got": got, "count": count}
            for (expected, got), count in sorted(confusion.items())
        ],
    }
    if task == "exact-physics-risk":
        negatives = [r for r in records if r["expected"]["matched"] is False]
        positives = [r for r in records if r["expected"]["matched"] is True]
        summary.update({
            "falsePositives": sum(r["got"] == {"matched": True} for r in negatives),
            "negativeTotal": len(negatives),
            "falsePositiveRate": sum(r["got"] == {"matched": True} for r in negatives) / len(negatives),
            "falseNegatives": sum(r["got"] != {"matched": True} for r in positives),
            "positiveTotal": len(positives),
            "falseNegativeRate": sum(r["got"] != {"matched": True} for r in positives) / len(positives),
        })
    return summary


def main() -> int:
    global ARGS
    ARGS = parse_args()
    if ARGS.repeat < 1:
        raise SystemExit("--repeat must be >= 1")
    profile = PROFILES[ARGS.profile]
    config = task_config(ARGS.task)
    fixture = json.loads(config["fixture"].read_text())
    cases = [
        case for case in fixture["cases"]
        if (not ARGS.only_category or case["category"] == ARGS.only_category)
        and (not ARGS.only_id or case["id"] == ARGS.only_id)
    ]
    records = []
    for repeat in range(1, ARGS.repeat + 1):
        for index, case in enumerate(cases, 1):
            record = call(ARGS.task, profile, config, case)
            record["repeat"] = repeat
            records.append(record)
            print(f"[{repeat}/{ARGS.repeat}] {index:02d}/{len(cases)} {case['id']}: {'PASS' if record['exact'] else 'FAIL'}", flush=True)
    report = {
        "metadata": {
            "task": ARGS.task, "profile": ARGS.profile,
            "profileConfig": profile, "gitCommit": git_commit(),
            "fixtureVersion": fixture.get("version"), "fixtureSha256": sha256(config["fixture"]),
            "promptVersion": config["promptVersion"], "repeat": ARGS.repeat,
            "generatedAt": datetime.now(timezone.utc).isoformat(),
        },
        "summary": summarize(ARGS.task, records),
        "records": records,
    }
    output = ARGS.output or RESULTS / f"matrix-{ARGS.task}-{ARGS.profile}-{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}.json"
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report["summary"], indent=2))
    print(f"Result: {output}")
    return 0


ARGS: argparse.Namespace

if __name__ == "__main__":
    raise SystemExit(main())
