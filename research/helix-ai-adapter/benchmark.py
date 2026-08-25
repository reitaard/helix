#!/usr/bin/env python3
"""Detached benchmark for Helix T2V core-settings interpretation.

This script calls only the local OpenAI-compatible helixai-adapter endpoint.
It never calls Helix runtime, Telegram, PostgreSQL, ComfyUI, or a GPU worker.
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
DEFAULT_CASES = ROOT / "cases" / "production-settings-v1.json"
DEFAULT_RESULTS_DIR = ROOT / "results"
PROMPT_VERSION = "production-settings-baseline-v1"

SYSTEM_PROMPT = """You are a semantic parser for an existing Helix text-to-video settings screen.

Interpret only explicit requests about these four core settings:
- aspect: one of 1:1, 2:3, 3:2, 3:4, 4:3, 9:16, 16:9, 21:9
- quality: low, standard, or high
- durationSeconds: an integer from 1 through 10
- enhance: whether Helix prompt enhancement is enabled

Canonical language:
- vertical or portrait video means aspect 9:16
- landscape or widescreen means aspect 16:9
- square means aspect 1:1
- ultrawide means aspect 21:9
- best/highest quality means quality high
- normal quality means quality standard
- lowest quality means quality low
- improve/rewrite the prompt means enhance true only when it is explicitly about prompt enhancement
- leave/keep the prompt unchanged means enhance false

Return a delta: include only settings explicitly requested or explicitly reaffirmed. Never copy unmentioned current settings.
Use status=no_settings when the text is creative prompt content and contains no settings request.
Use status=conflict when contradictory settings remain unresolved; put only the conflicting field names in conflictFields. Preserve independent non-conflicting changes.
Use status=unsupported when a requested setting is outside this four-field contract, outside supported values, or too vague to map safely. Preserve independently recognized safe changes and set unhandledMeaning=true.
Explicit corrections such as "actually", "instead", "correction", "scratch that", or "no" replace the earlier value and are not conflicts.
Never invent a number for vague relative words such as "a little longer".
For exact relative arithmetic, use currentSettings and reject a result outside 1-10.
Do not execute anything and do not rewrite creative prompt text."""

RESPONSE_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "status": {
            "type": "string",
            "enum": ["ok", "no_settings", "conflict", "unsupported"],
        },
        "changes": {
            "type": "object",
            "properties": {
                "aspect": {
                    "type": "string",
                    "enum": ["1:1", "2:3", "3:2", "3:4", "4:3", "9:16", "16:9", "21:9"],
                },
                "quality": {
                    "type": "string",
                    "enum": ["low", "standard", "high"],
                },
                "durationSeconds": {
                    "type": "integer",
                    "minimum": 1,
                    "maximum": 10,
                },
                "enhance": {"type": "boolean"},
            },
            "additionalProperties": False,
        },
        "conflictFields": {
            "type": "array",
            "items": {
                "type": "string",
                "enum": ["aspect", "quality", "durationSeconds", "enhance"],
            },
            "uniqueItems": True,
        },
        "unhandledMeaning": {"type": "boolean"},
    },
    "required": ["status", "changes", "conflictFields", "unhandledMeaning"],
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
    data = None if payload is None else json.dumps(payload).encode("utf-8")
    headers = {} if payload is None else {"Content-Type": "application/json"}
    method = "GET" if payload is None else "POST"
    request = urllib.request.Request(url, data=data, headers=headers, method=method)
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


def percentile(values: list[float], quantile: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    if len(ordered) == 1:
        return ordered[0]
    position = (len(ordered) - 1) * quantile
    low = math.floor(position)
    high = math.ceil(position)
    if low == high:
        return ordered[low]
    fraction = position - low
    return ordered[low] * (1 - fraction) + ordered[high] * fraction


def canonical_result(value: Any) -> Any:
    if not isinstance(value, dict):
        return value
    result = dict(value)
    if isinstance(result.get("conflictFields"), list):
        result["conflictFields"] = sorted(result["conflictFields"])
    return result


def git_commit() -> str:
    try:
        return subprocess.check_output(
            ["git", "rev-parse", "HEAD"], cwd=ROOT, text=True, stderr=subprocess.DEVNULL
        ).strip()
    except (OSError, subprocess.CalledProcessError):
        return "unknown"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def load_cases(path: Path, args: argparse.Namespace) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    fixture = json.loads(path.read_text(encoding="utf-8"))
    default_current = fixture["defaultCurrentSettings"]
    selected = []
    for case in fixture["cases"]:
        if args.only_category and case["category"] != args.only_category:
            continue
        if args.only_id and case["id"] != args.only_id:
            continue
        selected.append({**case, "currentSettings": case.get("currentSettings", default_current)})
    if not selected:
        raise SystemExit("No cases matched the requested filters")
    return fixture, selected


def call_case(args: argparse.Namespace, case: dict[str, Any]) -> dict[str, Any]:
    payload = {
        "model": args.model,
        "temperature": 0,
        "max_tokens": 160,
        "reasoning_effort": "none",
        "response_format": {
            "type": "json_schema",
            "json_schema": {"name": "helix_t2v_settings_delta", "schema": RESPONSE_SCHEMA},
        },
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {
                "role": "user",
                "content": json.dumps(
                    {
                        "currentSettings": case["currentSettings"],
                        "text": case["text"],
                    },
                    separators=(",", ":"),
                ),
            },
        ],
    }

    started = time.perf_counter()
    try:
        response = request_json(
            f"{args.endpoint.rstrip('/')}/v1/chat/completions", payload, args.timeout
        )
        wall_ms = (time.perf_counter() - started) * 1000
        content = response["choices"][0]["message"]["content"]
        parsed = canonical_result(json.loads(content))
        error = None
    except Exception as exc:  # preserve every transport/schema failure in results
        wall_ms = (time.perf_counter() - started) * 1000
        response = None
        content = None
        parsed = None
        error = f"{type(exc).__name__}: {exc}"

    expected = canonical_result(case["expected"])
    exact = parsed == expected
    expected_changes = expected.get("changes", {}) if isinstance(expected, dict) else {}
    got_changes = parsed.get("changes", {}) if isinstance(parsed, dict) else {}
    expected_keys = set(expected_changes)
    got_keys = set(got_changes) if isinstance(got_changes, dict) else set()
    correct_keys = {
        key for key in expected_keys & got_keys if got_changes.get(key) == expected_changes.get(key)
    }

    timings = response.get("timings", {}) if isinstance(response, dict) else {}
    return {
        "id": case["id"],
        "category": case["category"],
        "text": case["text"],
        "currentSettings": case["currentSettings"],
        "expected": expected,
        "got": parsed,
        "rawContent": content,
        "exact": exact,
        "statusCorrect": isinstance(parsed, dict) and parsed.get("status") == expected.get("status"),
        "expectedChangeKeys": sorted(expected_keys),
        "gotChangeKeys": sorted(got_keys),
        "correctChangeKeys": sorted(correct_keys),
        "wallMs": wall_ms,
        "promptMs": timings.get("prompt_ms"),
        "generationMs": timings.get("predicted_ms"),
        "generationTokensPerSecond": timings.get("predicted_per_second"),
        "error": error,
    }


def summarize(records: list[dict[str, Any]]) -> dict[str, Any]:
    total = len(records)
    exact = sum(bool(record["exact"]) for record in records)
    status = sum(bool(record["statusCorrect"]) for record in records)
    valid = sum(record["error"] is None and isinstance(record["got"], dict) for record in records)
    expected_fields = sum(len(record["expectedChangeKeys"]) for record in records)
    emitted_fields = sum(len(record["gotChangeKeys"]) for record in records)
    correct_fields = sum(len(record["correctChangeKeys"]) for record in records)
    latencies = [float(record["wallMs"]) for record in records]
    no_settings = [record for record in records if record["category"] == "no_settings"]
    false_positives = sum(
        not record["exact"]
        and (
            bool(record["gotChangeKeys"])
            or not isinstance(record["got"], dict)
            or record["got"].get("status") != "no_settings"
        )
        for record in no_settings
    )

    categories: dict[str, dict[str, int | float]] = {}
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for record in records:
        grouped[record["category"]].append(record)
    for category, category_records in sorted(grouped.items()):
        category_exact = sum(bool(record["exact"]) for record in category_records)
        categories[category] = {
            "correct": category_exact,
            "total": len(category_records),
            "accuracy": category_exact / len(category_records),
        }

    return {
        "exactCorrect": exact,
        "total": total,
        "exactAccuracy": exact / total,
        "statusAccuracy": status / total,
        "validResponses": valid,
        "schemaValidity": valid / total,
        "changePrecision": correct_fields / emitted_fields if emitted_fields else 1.0,
        "changeRecall": correct_fields / expected_fields if expected_fields else 1.0,
        "noSettingsFalsePositives": false_positives,
        "noSettingsTotal": len(no_settings),
        "noSettingsFalsePositiveRate": false_positives / len(no_settings) if no_settings else 0.0,
        "latencyP50Ms": percentile(latencies, 0.50),
        "latencyP95Ms": percentile(latencies, 0.95),
        "latencyMeanMs": statistics.mean(latencies),
        "categories": categories,
    }


def print_summary(summary: dict[str, Any], records: list[dict[str, Any]], show_passes: bool) -> None:
    print("\nHELIX QWEN PRODUCTION SETTINGS BENCHMARK")
    print("=" * 72)
    print(f"Exact accuracy:       {summary['exactCorrect']}/{summary['total']} ({summary['exactAccuracy']:.1%})")
    print(f"Status accuracy:      {summary['statusAccuracy']:.1%}")
    print(f"Schema validity:      {summary['schemaValidity']:.1%}")
    print(f"Change precision:     {summary['changePrecision']:.1%}")
    print(f"Change recall:        {summary['changeRecall']:.1%}")
    print(
        "No-settings FP:      "
        f"{summary['noSettingsFalsePositives']}/{summary['noSettingsTotal']} "
        f"({summary['noSettingsFalsePositiveRate']:.1%})"
    )
    print(f"Latency p50 / p95:    {summary['latencyP50Ms']:.0f} / {summary['latencyP95Ms']:.0f} ms")
    print("\nBY CATEGORY")
    for category, values in summary["categories"].items():
        print(f"  {category:14} {values['correct']:>2}/{values['total']:<2} ({values['accuracy']:.1%})")

    failures = [record for record in records if not record["exact"]]
    display = records if show_passes else failures
    if display:
        print("\n" + ("ALL CASES" if show_passes else "FAILURES"))
        print("-" * 72)
        for record in display:
            label = "PASS" if record["exact"] else "FAIL"
            print(f"[{label}] {record['id']} ({record['category']}) — {record['text']}")
            if not record["exact"]:
                print("  expected:", json.dumps(record["expected"], separators=(",", ":")))
                print("  got:     ", json.dumps(record["got"], separators=(",", ":")))
                if record["error"]:
                    print("  error:   ", record["error"])


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

    print(
        f"Running {len(cases)} cases x {args.repeat} repeat(s) against "
        f"{args.model} at {args.endpoint}",
        flush=True,
    )
    records: list[dict[str, Any]] = []
    for case in cases:
        for repeat in range(1, args.repeat + 1):
            record = call_case(args, case)
            record["repeat"] = repeat
            records.append(record)
        print(f"{case['id']}: {'PASS' if records[-1]['exact'] else 'FAIL'}", flush=True)

    summary = summarize(records)
    print_summary(summary, records, args.show_passes)

    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    output = args.output or DEFAULT_RESULTS_DIR / f"production-settings-v1-{timestamp}.json"
    output.parent.mkdir(parents=True, exist_ok=True)
    result = {
        "metadata": {
            "createdAt": datetime.now(timezone.utc).isoformat(),
            "gitCommit": git_commit(),
            "fixtureVersion": fixture.get("version"),
            "fixtureSha256": sha256(args.cases),
            "promptVersion": PROMPT_VERSION,
            "model": args.model,
            "endpoint": args.endpoint,
            "repeat": args.repeat,
            "systemPrompt": SYSTEM_PROMPT,
            "responseSchema": RESPONSE_SCHEMA,
        },
        "summary": summary,
        "records": records,
    }
    output.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(f"\nRaw result: {output}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
