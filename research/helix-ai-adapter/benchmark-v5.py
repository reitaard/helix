#!/usr/bin/env python3

import json
import os
import re
import statistics
import subprocess
import sys
import time
import urllib.request
from collections import defaultdict
from pathlib import Path

PORT = int(os.environ.get("HELIX_AI_BENCH_PORT", "8182"))
BASE_URL = f"http://127.0.0.1:{PORT}"
SERVER = os.environ.get("HELIX_ADAPTER", "helixai-adapter")
REPEATS = int(os.environ.get("REPEATS", "2"))
RESULTS_FILE = Path(
    os.environ.get(
        "HELIX_AI_BENCH_RESULTS",
        "/tmp/helix-ai-benchmark-v5-results.json",
    )
)

MODELS = [
    {
        "name": "Falcon-H1-0.5B-Q4",
        "hf": "tiiuae/Falcon-H1-0.5B-Instruct-GGUF:Q4_K_M",
        "api": "falcon-h1-0.5b",
        "reasoning_none": False,
    },
    {
        "name": "Qwen3-0.6B-Q8",
        "hf": "Qwen/Qwen3-0.6B-GGUF:Q8_0",
        "api": "qwen3-0.6b",
        "reasoning_none": True,
    },
    {
        "name": "Gemma3-270M-Q8",
        "hf": "ggml-org/gemma-3-270m-it-GGUF:Q8_0",
        "api": "gemma-3-270m",
        "reasoning_none": False,
    },
]

INTENTS = [
    "status",
    "queue",
    "jobs",
    "job",
    "outbox",
    "errors",
    "events",
    "t2v",
    "cancel",
    "help",
    "unsupported",
]

TOOLS = [
    "video.i2v",
    "video.t2v",
    "clarify",
]

ERROR_CATEGORIES = [
    "worker_not_found",
    "invalid_workflow_input",
    "backend_submission_failed",
    "backend_cancellation_failed",
    "job_not_found",
    "ambiguous_job_reference",
    "worker_offline",
    "worker_degraded",
    "job_failed",
    "job_timed_out",
    "delivery_failed",
    "diagnostic_timeout",
    "unknown_error",
]

SYSTEM_INTENT = """You are a tiny semantic adapter inside Helix.

Classify the natural-language request into one existing Helix operator intent.

Intents:
status = runtime/worker diagnostics
queue = current execution queue
jobs = recent jobs list
job = details for one job
outbox = delivery/send work needing attention
errors = recent failures
events = event timeline for one job
t2v = start text-to-video prompt flow
cancel = request cancellation for one job
help = command/help information
unsupported = restart, shell, package update, arbitrary worker mutation, deletion, or another unsupported control

Return only the typed JSON result.
Do not execute anything.
"""

SYSTEM_REFERENCE = """You are a tiny semantic adapter inside Helix.

Extract only the job reference written by the user.
A reference may be a full job_ ID, a short prefix, or a copied prefix ending in dots.
Do not decide whether it exists or is unique. Helix code does that.
Return only the typed JSON result.
"""

SYSTEM_TOOL = """You are a tiny semantic adapter inside Helix.

Choose the current media tool implied by the request:
video.i2v = video from an image/frame
video.t2v = video from text/prompt only
clarify = the request says to make a video but does not reveal whether the source is image or text

Return only the typed JSON result.
"""

SYSTEM_AMBIGUITY = """You are a tiny semantic adapter inside Helix.

Decide whether Helix has enough information to proceed.
clarify = a required job/reference is missing
proceed = the request contains the needed target or does not require a target

Do not invent prior conversation state.
Return only the typed JSON result.
"""

SYSTEM_ERROR = """You are a tiny semantic adapter inside Helix.

Classify the runtime/operator error into the closest Helix error family.

diagnostic_timeout includes advisory probe timeouts such as a Comfy WebSocket events timeout.
unknown_error is only for errors that do not fit the named families.

Return only the typed JSON result.
"""

SYSTEM_ASPECT = """You are a tiny semantic adapter inside Helix Production.

Extract the requested aspect ratio.
Use 16:9 for landscape/widescreen, 9:16 for vertical/portrait, and 1:1 for square.
This is semantic extraction only; it does not execute or mutate a workflow.
Return only the typed JSON result.
"""

SYSTEM_DURATION = """You are a tiny semantic adapter inside Helix Production.

Extract the explicitly requested video duration in whole seconds.
Return only the typed JSON result.
"""

SYSTEM_ENHANCE = """You are a tiny semantic adapter inside Helix Production.

Determine whether the user wants prompt enhancement/rewrite enabled.
true = enable/enhance/rewrite the prompt
false = keep the prompt as written / disable enhancement
Return only the typed JSON result.
"""

SYSTEM_QUALITY = """You are a tiny semantic adapter inside Helix Production.

Extract only the requested quality direction:
higher = user wants more quality/resolution
lower = user wants less quality/resolution
same = user explicitly wants unchanged quality

Do not invent a concrete preset name.
Return only the typed JSON result.
"""


def case(group, name, text, expected, system, schema, experimental=False):
    return {
        "group": group,
        "name": name,
        "text": text,
        "expected": expected,
        "system": system,
        "schema": schema,
        "experimental": experimental,
    }


def enum_schema(key, values):
    return {
        "type": "object",
        "properties": {
            key: {
                "type": "string",
                "enum": values,
            }
        },
        "required": [key],
        "additionalProperties": False,
    }


INTENT_SCHEMA = enum_schema("intent", INTENTS)
TOOL_SCHEMA = enum_schema("tool", TOOLS)
AMBIGUITY_SCHEMA = enum_schema(
    "decision",
    ["clarify", "proceed"],
)
ERROR_SCHEMA = enum_schema(
    "category",
    ERROR_CATEGORIES,
)
ASPECT_SCHEMA = enum_schema(
    "aspect_ratio",
    ["16:9", "9:16", "1:1"],
)
QUALITY_SCHEMA = enum_schema(
    "quality_direction",
    ["higher", "lower", "same"],
)
REFERENCE_SCHEMA = {
    "type": "object",
    "properties": {
        "reference": {
            "type": "string",
            "minLength": 1,
        }
    },
    "required": ["reference"],
    "additionalProperties": False,
}
DURATION_SCHEMA = {
    "type": "object",
    "properties": {
        "duration_seconds": {
            "type": "integer",
            "minimum": 1,
            "maximum": 120,
        }
    },
    "required": ["duration_seconds"],
    "additionalProperties": False,
}
ENHANCE_SCHEMA = {
    "type": "object",
    "properties": {
        "prompt_enhancement": {
            "type": "boolean",
        }
    },
    "required": ["prompt_enhancement"],
    "additionalProperties": False,
}

CASES = []

# ---------------------------------------------------------------------
# A. Natural command intent
# Exact slash commands are intentionally excluded; they should bypass AI.
# ---------------------------------------------------------------------

INTENT_PHRASES = {
    "status": [
        "how is the runtime doing?",
        "is Christopher Nolan healthy right now?",
        "show me the worker diagnostics",
    ],
    "queue": [
        "what is waiting on the gpu?",
        "anything currently running or queued?",
        "show the execution queue",
    ],
    "jobs": [
        "show me the recent jobs",
        "what did Helix run recently?",
        "list the latest generations",
    ],
    "job": [
        "what happened to job b270ee?",
        "show details for e2a4a9",
        "I want the state of that job id",
    ],
    "outbox": [
        "what still needs to be sent?",
        "show delivery work needing attention",
        "is anything stuck in the send queue?",
    ],
    "errors": [
        "show me recent failures",
        "what has been failing lately?",
        "give me the latest generation or delivery errors",
    ],
    "events": [
        "show the event history for b270ee",
        "give me the full timeline for that job id",
        "what events happened on job e2a4a9?",
    ],
    "t2v": [
        "I want to start a text to video generation",
        "let me enter a prompt for a new video",
        "start the text-prompt video flow",
    ],
    "cancel": [
        "cancel job b270ee",
        "stop e2a4a9",
        "I want to cancel that job id",
    ],
    "help": [
        "what can I ask Helix to do here?",
        "show the available operator commands",
        "I need the command help",
    ],
    "unsupported": [
        "restart ComfyUI for me",
        "update the worker to the latest Comfy master",
        "run a PowerShell command on Christopher Nolan",
        "delete every output file on the worker",
        "change the worker CUDA configuration",
        "install a package on the production machine",
    ],
}

for intent, phrases in INTENT_PHRASES.items():
    for index, text in enumerate(phrases, 1):
        CASES.append(
            case(
                "intent",
                f"{intent}-{index}",
                text,
                {"intent": intent},
                SYSTEM_INTENT,
                INTENT_SCHEMA,
            )
        )

# ---------------------------------------------------------------------
# B. Job/reference extraction
# Score uses the same normalization style as Helix resolveJobReference:
# optional job_ prefix and copied trailing dots do not change meaning.
# ---------------------------------------------------------------------

REFERENCE_CASES = [
    ("full-id", "show job_b270eea4177746d881c0c96d0f2f4b35", "job_b270eea4177746d881c0c96d0f2f4b35"),
    ("short-prefix", "show details for b270ee", "b270ee"),
    ("copied-dots", "what happened to e2a4a9...", "e2a4a9..."),
    ("cancel-prefix", "cancel b270eea4", "b270eea4"),
    ("events-prefix", "events for job_e2a4a9", "job_e2a4a9"),
    ("middle-text", "can you inspect job b270ee and tell me what happened", "b270ee"),
    ("quoted-id", "show me 'job_e2a4a9efff7a47b8b70cd41c068073ac'", "job_e2a4a9efff7a47b8b70cd41c068073ac"),
    ("cancel-full", "please stop job_b270eea4177746d881c0c96d0f2f4b35 now", "job_b270eea4177746d881c0c96d0f2f4b35"),
    ("events-dots", "timeline for b270ee...", "b270ee..."),
    ("mixed-case-prefix", "look up B270EE", "B270EE"),
    ("job-word-separated", "the job I mean is e2a4a9", "e2a4a9"),
    ("status-word-noise", "ignore its status text and open job_b270ee", "job_b270ee"),
    ("failure-word-noise", "the failed one I copied is e2a4a9...", "e2a4a9..."),
    ("long-prefix", "details on b270eea4177746d8", "b270eea4177746d8"),
    ("prefix-with-job", "cancel job_b270eea4.", "job_b270eea4."),
]

for name, text, expected in REFERENCE_CASES:
    CASES.append(
        case(
            "reference",
            name,
            text,
            {"reference": expected},
            SYSTEM_REFERENCE,
            REFERENCE_SCHEMA,
        )
    )

# ---------------------------------------------------------------------
# C. Current media-tool interpretation
# ---------------------------------------------------------------------

TOOL_CASES = [
    ("i2v-animate-image", "animate this image into a video", "video.i2v"),
    ("i2v-first-frame", "use this first frame to make the video", "video.i2v"),
    ("i2v-photo", "turn this photo into a moving clip", "video.i2v"),
    ("i2v-source-image", "generate from the source image I attached", "video.i2v"),
    ("i2v-still", "make the still frame move", "video.i2v"),
    ("t2v-description", "make a video from this text description", "video.t2v"),
    ("t2v-prompt", "generate a video using only this prompt", "video.t2v"),
    ("t2v-no-image", "there is no image; create it from the written scene", "video.t2v"),
    ("t2v-text-only", "text only: generate the scene as a video", "video.t2v"),
    ("t2v-description-only", "use my description as the source for the video", "video.t2v"),
    ("clarify-make-video", "make me a video", "clarify"),
    ("clarify-do-generation", "generate another clip", "clarify"),
    ("clarify-new-video", "start a new video generation", "clarify"),
    ("clarify-render", "render a video for me", "clarify"),
    ("clarify-again", "do another one", "clarify"),
]

for name, text, expected in TOOL_CASES:
    CASES.append(
        case(
            "tool",
            name,
            text,
            {"tool": expected},
            SYSTEM_TOOL,
            TOOL_SCHEMA,
        )
    )

# ---------------------------------------------------------------------
# D. Corrections and negation
# Same current operator intent surface, but the final instruction wins.
# ---------------------------------------------------------------------

CORRECTION_CASES = [
    ("cancel-to-job", "cancel b270ee — no, don't cancel it, just show the job", "job"),
    ("job-to-events", "show the job details; actually I want its event timeline", "events"),
    ("events-to-job", "show the events for e2a4a9, no just the job details", "job"),
    ("jobs-to-errors", "show recent jobs — actually only show recent failures", "errors"),
    ("errors-to-jobs", "show failures, correction: just list the latest jobs", "jobs"),
    ("cancel-to-queue", "cancel that job — never mind, show me the queue instead", "queue"),
    ("t2v-to-help", "start a text to video prompt — scratch that, show help", "help"),
    ("status-to-queue", "show worker status, no I only care about what is queued", "queue"),
    ("outbox-to-errors", "show the send queue; actually show delivery failures", "errors"),
    ("cancel-negated", "do not cancel b270ee, just open its details", "job"),
    ("events-negated", "I don't need the event history, just show the job", "job"),
    ("job-negated", "don't show the job details; show its events instead", "events"),
    ("queue-negated", "not the queue — show overall runtime diagnostics", "status"),
    ("errors-negated", "not errors, show me recent jobs", "jobs"),
    ("t2v-negated", "don't start generation; tell me what commands are available", "help"),
]

for name, text, expected in CORRECTION_CASES:
    CASES.append(
        case(
            "correction",
            name,
            text,
            {"intent": expected},
            SYSTEM_INTENT,
            INTENT_SCHEMA,
        )
    )

# ---------------------------------------------------------------------
# E. Missing-information detection
# This is intentionally separate from routing so we can measure
# over-clarification independently.
# ---------------------------------------------------------------------

AMBIGUITY_CASES = [
    ("cancel-missing", "cancel the job", "clarify"),
    ("job-missing", "show me that job", "clarify"),
    ("events-missing", "show its event history", "clarify"),
    ("cancel-it", "stop it", "clarify"),
    ("details-it", "what happened to it?", "clarify"),
    ("timeline-it", "give me the timeline for that one", "clarify"),
    ("cancel-present", "cancel b270ee", "proceed"),
    ("job-present", "show job e2a4a9", "proceed"),
    ("events-present", "events for b270ee", "proceed"),
    ("jobs-no-target-needed", "show recent jobs", "proceed"),
    ("queue-no-target-needed", "what is in the queue?", "proceed"),
    ("errors-no-target-needed", "show recent failures", "proceed"),
    ("status-no-target-needed", "how is the worker doing?", "proceed"),
    ("help-no-target-needed", "what commands are available?", "proceed"),
    ("t2v-no-target-needed", "start a text to video prompt flow", "proceed"),
]

for name, text, expected in AMBIGUITY_CASES:
    CASES.append(
        case(
            "ambiguity",
            name,
            text,
            {"decision": expected},
            SYSTEM_AMBIGUITY,
            AMBIGUITY_SCHEMA,
        )
    )

# ---------------------------------------------------------------------
# F. Runtime/error interpretation
# Strings are based on current Helix/runtime/operator error families.
# ---------------------------------------------------------------------

ERROR_CASES = [
    ("worker-not-found-1", "Worker not found: helix-rtx9999-01", "worker_not_found"),
    ("worker-not-found-2", "worker_not_found for requested worker", "worker_not_found"),
    ("workflow-image-path", "Image must be a relative Comfy input filename", "invalid_workflow_input"),
    ("workflow-no-loadimage", "Workflow contains no LoadImage node", "invalid_workflow_input"),
    ("workflow-multiple-image", "Workflow has multiple LoadImage nodes and no unique 'Load First Frame' target", "invalid_workflow_input"),
    ("submit-failed-1", "backend_submission_failed", "backend_submission_failed"),
    ("submit-failed-2", "Comfy backend submission failed for this media job", "backend_submission_failed"),
    ("cancel-failed-1", "backend_cancellation_failed", "backend_cancellation_failed"),
    ("cancel-failed-2", "backend cancellation failed while stopping the job", "backend_cancellation_failed"),
    ("job-not-found-1", "Job not found.", "job_not_found"),
    ("job-not-found-2", "job_not_found", "job_not_found"),
    ("ambiguous-prefix-1", "Prefix is ambiguous. Use more characters.", "ambiguous_job_reference"),
    ("ambiguous-prefix-2", "more than one job matches that copied prefix", "ambiguous_job_reference"),
    ("worker-offline-1", "worker offline", "worker_offline"),
    ("worker-offline-2", "the production worker cannot be reached", "worker_offline"),
    ("worker-degraded-1", "worker state is degraded", "worker_degraded"),
    ("worker-degraded-2", "runtime is reachable but required readiness checks are degraded", "worker_degraded"),
    ("job-failed-1", "job.failed", "job_failed"),
    ("job-failed-2", "generation job finished with failed status", "job_failed"),
    ("job-timeout-1", "job.timed_out", "job_timed_out"),
    ("job-timeout-2", "running generation exceeded the configured timeout", "job_timed_out"),
    ("delivery-failed-1", "delivery.failed", "delivery_failed"),
    ("delivery-failed-2", "Telegram delivery reached terminal failed state", "delivery_failed"),
    ("websocket-timeout-1", "Comfy WebSocket timeout", "diagnostic_timeout"),
    ("websocket-timeout-2", "events WebSocket probe timed out but queue and history remain available", "diagnostic_timeout"),
    ("unknown-db", "database connection was unexpectedly closed", "unknown_error"),
    ("unknown-json", "could not parse upstream metadata payload", "unknown_error"),
]

for name, text, expected in ERROR_CASES:
    CASES.append(
        case(
            "error",
            name,
            text,
            {"category": expected},
            SYSTEM_ERROR,
            ERROR_SCHEMA,
        )
    )

# ---------------------------------------------------------------------
# G. Experimental near-future Production settings
# These are semantic extraction tests only. They do not claim the
# runtime settings contract or workflow binder is frozen.
# ---------------------------------------------------------------------

ASPECT_CASES = [
    ("landscape-1", "make it widescreen", "16:9"),
    ("landscape-2", "use a landscape 16 by 9 frame", "16:9"),
    ("landscape-3", "horizontal cinematic format", "16:9"),
    ("portrait-1", "make it vertical", "9:16"),
    ("portrait-2", "use portrait 9 by 16", "9:16"),
    ("portrait-3", "phone-first vertical format", "9:16"),
    ("square-1", "make it square", "1:1"),
    ("square-2", "use a one-to-one aspect ratio", "1:1"),
    ("square-3", "I want a 1:1 frame", "1:1"),
]

for name, text, expected in ASPECT_CASES:
    CASES.append(
        case(
            "setting_aspect",
            name,
            text,
            {"aspect_ratio": expected},
            SYSTEM_ASPECT,
            ASPECT_SCHEMA,
            experimental=True,
        )
    )

DURATION_CASES = [
    ("duration-4", "make it 4 seconds long", 4),
    ("duration-5", "five second video", 5),
    ("duration-8", "set the duration to 8 seconds", 8),
    ("duration-10", "I want a ten-second clip", 10),
    ("duration-12", "make this last 12 seconds", 12),
    ("duration-15", "duration should be fifteen seconds", 15),
]

for name, text, expected in DURATION_CASES:
    CASES.append(
        case(
            "setting_duration",
            name,
            text,
            {"duration_seconds": expected},
            SYSTEM_DURATION,
            DURATION_SCHEMA,
            experimental=True,
        )
    )

ENHANCE_CASES = [
    ("enhance-on-1", "enhance my prompt before generation", True),
    ("enhance-on-2", "rewrite the prompt to improve it", True),
    ("enhance-on-3", "turn prompt enhancement on", True),
    ("enhance-off-1", "do not enhance my prompt", False),
    ("enhance-off-2", "keep my prompt exactly as written", False),
    ("enhance-off-3", "disable prompt rewriting", False),
]

for name, text, expected in ENHANCE_CASES:
    CASES.append(
        case(
            "setting_enhance",
            name,
            text,
            {"prompt_enhancement": expected},
            SYSTEM_ENHANCE,
            ENHANCE_SCHEMA,
            experimental=True,
        )
    )

QUALITY_CASES = [
    ("quality-up-1", "use higher quality this time", "higher"),
    ("quality-up-2", "increase the resolution quality", "higher"),
    ("quality-up-3", "give me the better quality version", "higher"),
    ("quality-down-1", "lower the quality to save resources", "lower"),
    ("quality-down-2", "use a cheaper lower-resolution pass", "lower"),
    ("quality-down-3", "reduce the quality for this test", "lower"),
    ("quality-same-1", "keep the same quality as before", "same"),
    ("quality-same-2", "do not change the resolution quality", "same"),
    ("quality-same-3", "leave quality unchanged", "same"),
]

for name, text, expected in QUALITY_CASES:
    CASES.append(
        case(
            "setting_quality",
            name,
            text,
            {"quality_direction": expected},
            SYSTEM_QUALITY,
            QUALITY_SCHEMA,
            experimental=True,
        )
    )


def out(*args):
    print(*args, flush=True)


def http_json(method, path, payload=None, timeout=45):
    data = None
    headers = {}

    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"

    request = urllib.request.Request(
        BASE_URL + path,
        data=data,
        headers=headers,
        method=method,
    )

    with urllib.request.urlopen(request, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


def wait_ready(proc, timeout=90):
    end = time.time() + timeout

    while time.time() < end:
        if proc.poll() is not None:
            return False

        try:
            result = http_json("GET", "/health", timeout=2)
            if result.get("status") == "ok":
                return True
        except Exception:
            pass

        time.sleep(0.25)

    return False


def rss_mb(pid):
    try:
        with open(f"/proc/{pid}/status") as f:
            for line in f:
                if line.startswith("VmRSS:"):
                    return int(line.split()[1]) / 1024
    except Exception:
        pass

    return 0.0


def adapter_running():
    try:
        subprocess.check_output(
            ["pgrep", "-x", "helixai-adapter"],
            stderr=subprocess.DEVNULL,
        )
        return True
    except subprocess.CalledProcessError:
        return False


def percentile(values, p):
    values = sorted(values)

    if not values:
        return 0.0

    if len(values) == 1:
        return values[0]

    position = (len(values) - 1) * p
    low = int(position)
    high = min(low + 1, len(values) - 1)
    fraction = position - low

    return (
        values[low] * (1 - fraction)
        + values[high] * fraction
    )


def normalize_reference(value):
    if value is None:
        return ""

    clean = str(value).strip()

    # Remove wrapping quote characters only.
    clean = clean.strip("\"'`")

    # Mirror Helix's copied-prefix convenience.
    clean = re.sub(r"\.+$", "", clean)

    if clean.lower().startswith("job_"):
        clean = clean[4:]

    return clean.lower()


def score(case_data, got):
    if not isinstance(got, dict):
        return False

    expected = case_data["expected"]

    if case_data["group"] == "reference":
        return normalize_reference(
            got.get("reference")
        ) == normalize_reference(
            expected["reference"]
        )

    return got == expected


def call_model(model, case_data):
    payload = {
        "model": model["api"],
        "temperature": 0,
        "max_tokens": 32,
        "response_format": {
            "type": "json_schema",
            "json_schema": {
                "name": "helix_adapter_result",
                "schema": case_data["schema"],
            },
        },
        "messages": [
            {
                "role": "system",
                "content": case_data["system"],
            },
            {
                "role": "user",
                "content": case_data["text"],
            },
        ],
    }

    if model["reasoning_none"]:
        payload["reasoning_effort"] = "none"

    started = time.perf_counter()

    try:
        response = http_json(
            "POST",
            "/v1/chat/completions",
            payload,
            timeout=60,
        )
    except Exception as exc:
        return {
            "ok": False,
            "got": None,
            "error": str(exc),
            "wall_ms": (
                time.perf_counter()
                - started
            ) * 1000,
        }

    wall_ms = (
        time.perf_counter()
        - started
    ) * 1000

    try:
        content = (
            response["choices"][0]
            ["message"]["content"]
        )
        got = json.loads(content)
    except Exception:
        content = None
        got = None

    timings = response.get("timings", {})

    return {
        "got": got,
        "content": content,
        "wall_ms": wall_ms,
        "generation_tps": timings.get(
            "predicted_per_second"
        ),
        "prompt_tps": timings.get(
            "prompt_per_second"
        ),
    }


def warmup(model):
    warm_case = case(
        "warmup",
        "warmup",
        "how is the runtime doing?",
        {"intent": "status"},
        SYSTEM_INTENT,
        INTENT_SCHEMA,
    )
    call_model(model, warm_case)


def summarize_records(records):
    groups = defaultdict(list)

    for record in records:
        groups[
            record["group"]
        ].append(record)

    summary = {}

    for group, rows in groups.items():
        total = len(rows)
        correct = sum(
            bool(row["ok"])
            for row in rows
        )

        by_case = defaultdict(list)
        for row in rows:
            by_case[row["case_name"]].append(
                json.dumps(
                    row.get("got"),
                    sort_keys=True,
                    separators=(",", ":"),
                )
            )

        stable = sum(
            1
            for vals in by_case.values()
            if len(set(vals)) == 1
        )

        latencies = [
            row["wall_ms"]
            for row in rows
            if row.get("wall_ms")
            is not None
        ]

        summary[group] = {
            "correct": correct,
            "total": total,
            "accuracy": (
                correct / total
                if total
                else 0.0
            ),
            "stable_cases": stable,
            "case_count": len(by_case),
            "p50_ms": percentile(
                latencies,
                0.50,
            ),
            "p95_ms": percentile(
                latencies,
                0.95,
            ),
        }

    return summary


def core_groups():
    return [
        "intent",
        "reference",
        "tool",
        "correction",
        "ambiguity",
        "error",
    ]


def experimental_groups():
    return [
        "setting_aspect",
        "setting_duration",
        "setting_enhance",
        "setting_quality",
    ]


def weighted_accuracy(summary, groups):
    correct = 0
    total = 0

    for group in groups:
        item = summary.get(group)
        if not item:
            continue

        correct += item["correct"]
        total += item["total"]

    return (
        correct / total
        if total
        else 0.0
    )


def save_results(results):
    RESULTS_FILE.write_text(
        json.dumps(
            results,
            indent=2,
        )
    )


def run_model(model):
    out()
    out("=" * 82)
    out(model["name"])
    out("=" * 82)

    log_path = Path(
        f"/tmp/{model['name']}-v5-server.log"
    )

    log = open(log_path, "w")

    proc = subprocess.Popen(
        [
            SERVER,
            "-hf",
            model["hf"],
            "-t",
            "6",
            "-c",
            "4096",
            "--host",
            "127.0.0.1",
            "--port",
            str(PORT),
        ],
        stdout=log,
        stderr=subprocess.STDOUT,
    )

    try:
        out("Loading model...")

        if not wait_ready(proc):
            out("SERVER FAILED TO START")
            out(f"See {log_path}")
            return None

        loaded_rss = rss_mb(proc.pid)
        out(
            f"Ready. PID={proc.pid} "
            f"RSS={loaded_rss:.0f} MB"
        )

        out("Warm-up...")
        warmup(model)

        records = []
        max_rss = loaded_rss

        grouped_cases = defaultdict(list)
        for item in CASES:
            grouped_cases[
                item["group"]
            ].append(item)

        group_order = (
            core_groups()
            + experimental_groups()
        )

        for group in group_order:
            cases = grouped_cases[group]

            out()
            label = (
                group.upper()
                .replace("_", " ")
            )

            if cases[0]["experimental"]:
                label += " [EXPERIMENTAL]"

            out(label)
            out("-" * 82)

            group_correct = 0
            group_total = 0

            for item in cases:
                case_correct = 0

                for repeat in range(
                    1,
                    REPEATS + 1,
                ):
                    result = call_model(
                        model,
                        item,
                    )

                    ok = (
                        result.get("error")
                        is None
                        and score(
                            item,
                            result.get("got"),
                        )
                    )

                    case_correct += int(ok)
                    group_correct += int(ok)
                    group_total += 1

                    max_rss = max(
                        max_rss,
                        rss_mb(proc.pid),
                    )

                    records.append({
                        "group": group,
                        "experimental":
                            item["experimental"],
                        "case_name":
                            item["name"],
                        "text":
                            item["text"],
                        "repeat":
                            repeat,
                        "expected":
                            item["expected"],
                        "got":
                            result.get("got"),
                        "ok":
                            ok,
                        "error":
                            result.get("error"),
                        "wall_ms":
                            result.get("wall_ms"),
                        "generation_tps":
                            result.get(
                                "generation_tps"
                            ),
                        "rss_mb":
                            rss_mb(proc.pid),
                    })

                marker = (
                    "PASS"
                    if case_correct == REPEATS
                    else (
                        "MIX "
                        if case_correct > 0
                        else "FAIL"
                    )
                )

                if (
                    case_correct != REPEATS
                    or os.environ.get(
                        "VERBOSE_CASES"
                    ) == "1"
                ):
                    out(
                        f"{marker} "
                        f"{case_correct}/{REPEATS} "
                        f"{item['name']}"
                    )

            out(
                f"Group: {group_correct}/"
                f"{group_total} "
                f"({100*group_correct/group_total:.1f}%)"
            )

        summary = summarize_records(
            records
        )

        core = weighted_accuracy(
            summary,
            core_groups(),
        )

        experimental = weighted_accuracy(
            summary,
            experimental_groups(),
        )

        latencies = [
            row["wall_ms"]
            for row in records
            if row.get("wall_ms")
            is not None
        ]

        tps_values = [
            row["generation_tps"]
            for row in records
            if row.get("generation_tps")
            is not None
        ]

        out()
        out("MODEL SUMMARY")
        out("-" * 82)

        for group in (
            core_groups()
            + experimental_groups()
        ):
            item = summary[group]
            suffix = (
                " *"
                if group in experimental_groups()
                else ""
            )

            out(
                f"{group:18} "
                f"{item['correct']:3}/"
                f"{item['total']:<3} "
                f"{100*item['accuracy']:6.1f}%  "
                f"stable "
                f"{item['stable_cases']}/"
                f"{item['case_count']}"
                f"{suffix}"
            )

        out()
        out(
            f"CORE accuracy:       "
            f"{100*core:.1f}%"
        )
        out(
            f"SETTINGS accuracy*:  "
            f"{100*experimental:.1f}%"
        )
        out(
            f"Latency p50/p95:     "
            f"{percentile(latencies, .50):.0f}/"
            f"{percentile(latencies, .95):.0f} ms"
        )

        if tps_values:
            out(
                f"Generation:          "
                f"{statistics.mean(tps_values):.1f} tok/s"
            )

        out(
            f"RSS loaded/max:      "
            f"{loaded_rss:.0f}/"
            f"{max_rss:.0f} MB"
        )
        out(
            "* settings are semantic tests, "
            "not a frozen runtime contract"
        )

        failures = [
            row
            for row in records
            if not row["ok"]
        ]

        if failures:
            out()
            out("FAILURE SAMPLE")
            out("-" * 82)

            shown = set()
            count = 0

            for row in failures:
                key = (
                    row["group"],
                    row["case_name"],
                )

                if key in shown:
                    continue

                shown.add(key)

                out(
                    f"[{row['group']}] "
                    f"{row['case_name']}"
                )
                out(
                    " text:     ",
                    row["text"],
                )
                out(
                    " expected: ",
                    json.dumps(
                        row["expected"],
                        separators=(",", ":"),
                    ),
                )
                out(
                    " got:      ",
                    json.dumps(
                        row["got"],
                        separators=(",", ":"),
                    ),
                )

                if row["error"]:
                    out(
                        " error:    ",
                        row["error"],
                    )

                count += 1

                if count >= 18:
                    out(
                        "... remaining failures "
                        "are in the raw results"
                    )
                    break

        return {
            "model": model,
            "loaded_rss_mb": loaded_rss,
            "max_rss_mb": max_rss,
            "core_accuracy": core,
            "settings_accuracy": experimental,
            "overall_p50_ms": percentile(
                latencies,
                0.50,
            ),
            "overall_p95_ms": percentile(
                latencies,
                0.95,
            ),
            "summary": summary,
            "records": records,
        }

    finally:
        proc.terminate()

        try:
            proc.wait(timeout=10)
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.wait()

        log.close()
        time.sleep(1)


def main():
    if REPEATS < 1:
        raise SystemExit(
            "REPEATS must be >= 1"
        )

    if adapter_running():
        out(
            "A helixai-adapter process "
            "is already running."
        )
        out(
            "Stop it first, then rerun V5."
        )
        sys.exit(1)

    core_case_count = sum(
        1
        for item in CASES
        if not item["experimental"]
    )
    settings_case_count = (
        len(CASES) - core_case_count
    )

    total_requests = (
        len(CASES)
        * REPEATS
        * len(MODELS)
    )

    out()
    out(
        "HELIX AI ADAPTER BENCHMARK V5"
    )
    out(
        "Real ambiguity-boundary benchmark"
    )
    out()
    out(
        f"Models:              "
        f"{len(MODELS)}"
    )
    out(
        f"Core cases/model:    "
        f"{core_case_count}"
    )
    out(
        f"Settings cases/model:"
        f" {settings_case_count} "
        f"(experimental)"
    )
    out(
        f"Repeats:             "
        f"{REPEATS}"
    )
    out(
        f"Total requests:      "
        f"{total_requests}"
    )
    out()
    out(
        "Exact slash commands, exact yes/no, "
        "database truth and job-prefix lookup "
        "are intentionally NOT benchmarked."
    )

    results = []

    try:
        for model in MODELS:
            result = run_model(model)

            if result is not None:
                results.append(result)
                save_results(results)

    except KeyboardInterrupt:
        out()
        out(
            "Interrupted. Saving completed "
            "model results."
        )
        save_results(results)
        raise

    out()
    out("=" * 110)
    out("FINAL COMPARISON V5")
    out("=" * 110)

    header = (
        f"{'Model':25} "
        f"{'Core':>7} "
        f"{'Intent':>7} "
        f"{'Ref':>7} "
        f"{'Tool':>7} "
        f"{'Correct':>7} "
        f"{'Ambig':>7} "
        f"{'Error':>7} "
        f"{'Settings*':>10} "
        f"{'P50':>8} "
        f"{'P95':>8} "
        f"{'RSS':>7}"
    )

    out(header)
    out("-" * 110)

    results.sort(
        key=lambda item: (
            -item["core_accuracy"],
            item["overall_p50_ms"],
            item["max_rss_mb"],
        )
    )

    for item in results:
        s = item["summary"]

        def pct(group):
            return (
                100
                * s[group]["accuracy"]
            )

        out(
            f"{item['model']['name']:25} "
            f"{100*item['core_accuracy']:6.1f}% "
            f"{pct('intent'):6.1f}% "
            f"{pct('reference'):6.1f}% "
            f"{pct('tool'):6.1f}% "
            f"{pct('correction'):6.1f}% "
            f"{pct('ambiguity'):6.1f}% "
            f"{pct('error'):6.1f}% "
            f"{100*item['settings_accuracy']:9.1f}% "
            f"{item['overall_p50_ms']:7.0f}ms "
            f"{item['overall_p95_ms']:7.0f}ms "
            f"{item['max_rss_mb']:6.0f}M"
        )

    out()
    out(
        "Settings* combines aspect, duration, "
        "prompt-enhancement and quality-direction "
        "semantic extraction."
    )
    out(
        "It is reported separately because the "
        "Production settings contract is not frozen."
    )
    out()
    out(
        f"Raw results: {RESULTS_FILE}"
    )


if __name__ == "__main__":
    main()
