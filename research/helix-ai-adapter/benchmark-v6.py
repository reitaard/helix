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
RESULTS_FILE = Path(
    os.environ.get(
        "HELIX_AI_BENCH_RESULTS",
        "/tmp/helix-ai-benchmark-v6-results.json",
    )
)
STRESS_CALLS = int(os.environ.get("STRESS_CALLS", "180"))
ROTATING_SCHEMAS = int(os.environ.get("ROTATING_SCHEMAS", "24"))
THREADS = os.environ.get("HELIX_AI_THREADS", "6")
CONTEXT = os.environ.get("HELIX_AI_CONTEXT", "4096")

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

ERROR_FAMILIES = [
    "input_error",
    "backend_error",
    "worker_unavailable",
    "job_failure",
    "delivery_failure",
    "advisory_diagnostic",
    "unknown_error",
]

SYSTEM_INTENT = """You are a tiny semantic adapter inside Helix.

Classify the user's requested operator action.

status = runtime or worker health/diagnostics
queue = jobs currently running or waiting for execution
jobs = list recent media jobs/generations
job = details/status for one specific job
outbox = output delivery/send queue or delivery work needing attention
errors = list recent Helix job/delivery failures
events = event/timeline history for one specific job
t2v = start the text-to-video prompt-entry flow
cancel = request cancellation of one specific job
help = ask what commands/capabilities are available
unsupported = restart/shell/package/update/delete/config mutation or another unsupported control

Choose the action the user ultimately asks for. If they correct or negate an earlier request, the final instruction wins.
Do not execute anything.
Return only the typed JSON result.
"""

SYSTEM_TOOL = """You are a tiny semantic adapter inside Helix Production.

Use both CONTEXT and REQUEST.

video.i2v = the requested video should use an available image/frame/photo as its source
video.t2v = the requested video should use text/prompt/description as its source
clarify = the user asks for video generation but the source cannot be determined from the request and context

CONTEXT fields:
has_image = an image attachment/source is available
has_text_source = a meaningful text prompt/description is available

Rules:
- Explicit image/frame/photo language selects video.i2v when an image exists.
- Explicit text/prompt/description language selects video.t2v.
- If only one source type exists and the request is generic, use that available source.
- If both source types exist and the request is generic, clarify.
- If neither source exists, clarify.

Do not execute anything.
Return only the typed JSON result.
"""

SYSTEM_ERROR = """You are a tiny semantic adapter inside Helix.

Classify a raw, human-readable runtime/backend message into one broad semantic family.

input_error = invalid media/workflow input, missing required workflow input, invalid image/path/binding
backend_error = backend submission/cancellation/HTTP execution transport failed before or around execution
worker_unavailable = production worker or Comfy backend cannot be reached / is offline
job_failure = an accepted/running generation job itself failed or exceeded its execution timeout
delivery_failure = generated output exists or job finished, but sending/delivering the artifact failed
advisory_diagnostic = optional diagnostic/event/WebSocket probe failed while core queue/history/runtime remains usable
unknown_error = unrelated or unrecognized infrastructure/error text

These are semantic families, not exact Helix error codes.
Do not invent a more specific cause than the message supports.
Return only the typed JSON result.
"""

SYSTEM_ASPECT = """You are a tiny semantic adapter inside Helix Production.
Extract the requested aspect ratio.
16:9 = landscape/widescreen/horizontal
9:16 = portrait/vertical/phone-first vertical
1:1 = square
Return only the typed JSON result.
"""

SYSTEM_DURATION = """You are a tiny semantic adapter inside Helix Production.
Extract the explicitly requested whole-second video duration.
Return only the typed JSON result.
"""

SYSTEM_ENHANCE = """You are a tiny semantic adapter inside Helix Production.
Determine whether prompt enhancement/rewrite should be enabled.
true = enhance/rewrite/improve the prompt
false = preserve the user's prompt / disable rewriting
Return only the typed JSON result.
"""

SYSTEM_QUALITY = """You are a tiny semantic adapter inside Helix Production.
Extract only the requested quality direction.
higher = more quality/resolution
lower = less quality/resolution
same = explicitly unchanged quality
Return only the typed JSON result.
"""

SYSTEM_SETTINGS_COMBINED = """You are a tiny semantic adapter inside Helix Production.

Extract only settings explicitly requested by the user.
Possible keys:
aspect_ratio: 16:9, 9:16, or 1:1
duration_seconds: whole seconds
prompt_enhancement: true or false
quality_direction: higher, lower, or same

Omit any setting the user did not mention.
Do not invent a concrete resolution preset.
Return only the typed JSON result.
"""


def enum_schema(key, values):
    return {
        "type": "object",
        "properties": {
            key: {
                "type": "string",
                "enum": list(values),
            }
        },
        "required": [key],
        "additionalProperties": False,
    }


INTENT_SCHEMA = enum_schema("intent", INTENTS)
TOOL_SCHEMA = enum_schema("tool", TOOLS)
ERROR_SCHEMA = enum_schema("category", ERROR_FAMILIES)
ASPECT_SCHEMA = enum_schema("aspect_ratio", ["16:9", "9:16", "1:1"])
QUALITY_SCHEMA = enum_schema("quality_direction", ["higher", "lower", "same"])

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

SETTINGS_COMBINED_SCHEMA = {
    "type": "object",
    "properties": {
        "aspect_ratio": {
            "type": "string",
            "enum": ["16:9", "9:16", "1:1"],
        },
        "duration_seconds": {
            "type": "integer",
            "minimum": 1,
            "maximum": 120,
        },
        "prompt_enhancement": {
            "type": "boolean",
        },
        "quality_direction": {
            "type": "string",
            "enum": ["higher", "lower", "same"],
        },
    },
    "additionalProperties": False,
}


def make_case(group, family, name, text, expected, system, schema, experimental=False):
    return {
        "group": group,
        "family": family,
        "name": name,
        "text": text,
        "expected": expected,
        "system": system,
        "schema": schema,
        "experimental": experimental,
    }


CASES = []

# A. Natural-language intent routing. Exact slash commands bypass AI.
INTENT_PHRASES = {
    "status": [
        "how is the runtime doing?",
        "is Christopher Nolan healthy right now?",
        "show worker health and diagnostics",
        "tell me whether the production worker is okay",
        "what is the current runtime health?",
    ],
    "queue": [
        "what is waiting on the gpu?",
        "anything currently running or queued?",
        "show the execution queue",
        "what jobs are in flight right now?",
        "is the gpu busy with anything?",
    ],
    "jobs": [
        "show me the recent jobs",
        "what did Helix run recently?",
        "list the latest generations",
        "show the last few media jobs",
        "what generations have we run lately?",
    ],
    "job": [
        "what happened to job b270ee?",
        "show details for e2a4a9",
        "open job e2a4a9",
        "give me the state of that job id",
        "I need the details for one generation job",
    ],
    "outbox": [
        "what still needs to be sent?",
        "show delivery work needing attention",
        "is anything stuck in the send queue?",
        "show pending delivery work",
        "what outputs are waiting to be delivered?",
    ],
    "errors": [
        "show me recent failures",
        "what has been failing lately?",
        "give me the latest generation or delivery errors",
        "show recent Helix errors",
        "what failures need my attention?",
    ],
    "events": [
        "show the event history for b270ee",
        "give me the full timeline for that job id",
        "what events happened on job e2a4a9?",
        "show the lifecycle events for this job",
        "I want the event timeline for one generation",
    ],
    "t2v": [
        "I want to start a text to video generation",
        "let me enter a prompt for a new video",
        "start the text-prompt video flow",
        "begin a new text-to-video prompt",
        "I want to make a video from a written scene",
    ],
    "cancel": [
        "cancel job b270ee",
        "stop e2a4a9",
        "I want to cancel that job id",
        "request cancellation for this generation",
        "stop that specific running media job",
    ],
    "help": [
        "what can I ask Helix to do here?",
        "show the available operator commands",
        "I need the command help",
        "what controls are available to me?",
        "show me what this operator interface can do",
    ],
    "unsupported": [
        "restart ComfyUI for me",
        "update the worker to the latest Comfy master",
        "run a PowerShell command on Christopher Nolan",
        "delete every output file on the worker",
        "change the worker CUDA configuration",
        "install a package on the production machine",
        "restart the production machine",
        "change the pinned Comfy revision now",
    ],
}

for intent, phrases in INTENT_PHRASES.items():
    for index, text in enumerate(phrases, 1):
        CASES.append(make_case("intent", intent, f"{intent}-{index}", text, {"intent": intent}, SYSTEM_INTENT, INTENT_SCHEMA))

# B. Corrections and negation.
CORRECTION_CASES = [
    ("final-job", "cancel b270ee — no, don't cancel it, just show the job", "job"),
    ("final-events", "show the job details; actually I want its event timeline", "events"),
    ("final-job-2", "show the events for e2a4a9, no just the job details", "job"),
    ("final-errors", "show recent jobs — actually only show recent failures", "errors"),
    ("final-jobs", "show failures, correction: just list the latest jobs", "jobs"),
    ("final-queue", "cancel that job — never mind, show me the queue instead", "queue"),
    ("final-help", "start a text to video prompt — scratch that, show help", "help"),
    ("final-queue-2", "show worker status, no I only care about what is queued", "queue"),
    ("final-errors-2", "show the send queue; actually show delivery failures", "errors"),
    ("negate-cancel", "do not cancel b270ee, just open its details", "job"),
    ("negate-events", "I don't need the event history, just show the job", "job"),
    ("negate-job", "don't show the job details; show its events instead", "events"),
    ("negate-queue", "not the queue — show overall runtime diagnostics", "status"),
    ("negate-errors", "not errors, show me recent jobs", "jobs"),
    ("negate-t2v", "don't start generation; tell me what commands are available", "help"),
    ("cancel-then-events", "cancel e2a4a9; actually don't stop it, show its events", "events"),
    ("status-then-errors", "show status — wait, what I need is the recent failure list", "errors"),
    ("jobs-then-outbox", "list recent jobs, no, show what still needs delivery", "outbox"),
    ("outbox-then-jobs", "show pending sends; correction, list the recent jobs instead", "jobs"),
    ("help-then-t2v", "show help — actually start the text-to-video prompt flow", "t2v"),
    ("unsupported-negated", "restart ComfyUI — no, don't restart anything, just show status", "status"),
    ("delete-negated", "delete the outputs — don't do that, just show the outbox", "outbox"),
    ("cancel-negated-short", "don't stop e2a4a9, show its job details", "job"),
    ("events-negated-short", "not the timeline, just give me the job", "job"),
]
for index, (family, text, expected) in enumerate(CORRECTION_CASES, 1):
    CASES.append(make_case("correction", family, f"correction-{index}", text, {"intent": expected}, SYSTEM_INTENT, INTENT_SCHEMA))

# C. Media tool routing with real attachment/source context.
TOOL_CASES = [
    ("i2v", True, False, "animate this image into a video", "video.i2v"),
    ("i2v", True, True, "use the attached image as the first frame", "video.i2v"),
    ("i2v", True, True, "turn this photo into a moving clip", "video.i2v"),
    ("i2v", True, False, "make this still frame move", "video.i2v"),
    ("i2v", True, True, "build the video from the source image I attached", "video.i2v"),
    ("i2v", True, False, "animate this", "video.i2v"),
    ("i2v", True, False, "make a video", "video.i2v"),
    ("t2v", False, True, "make a video from this text description", "video.t2v"),
    ("t2v", False, True, "turn this prompt into a video", "video.t2v"),
    ("t2v", False, True, "there is no image, create the written scene", "video.t2v"),
    ("t2v", False, True, "text only: generate this as a video", "video.t2v"),
    ("t2v", False, True, "use my description as the source", "video.t2v"),
    ("t2v", False, True, "generate this", "video.t2v"),
    ("t2v", False, True, "make a video", "video.t2v"),
    ("clarify", True, True, "make another video", "clarify"),
    ("clarify", True, True, "generate another clip", "clarify"),
    ("clarify", True, True, "render a video for me", "clarify"),
    ("clarify", False, False, "make a video", "clarify"),
    ("clarify", False, False, "generate another clip", "clarify"),
    ("clarify", False, False, "do another one", "clarify"),
]
for index, (family, has_image, has_text, request, expected) in enumerate(TOOL_CASES, 1):
    text = f"CONTEXT:\nhas_image={str(has_image).lower()}\nhas_text_source={str(has_text).lower()}\n\nREQUEST:\n{request}"
    CASES.append(make_case("tool_context", family, f"tool-{index}", text, {"tool": expected}, SYSTEM_TOOL, TOOL_SCHEMA))

# D. Broad semantic error interpretation. Exact machine codes bypass AI.
ERROR_CASES = [
    ("input_error", "the workflow has no suitable LoadImage target"),
    ("input_error", "the image path is absolute but only relative Comfy inputs are allowed"),
    ("input_error", "required media input is missing from the workflow binding"),
    ("input_error", "the supplied workflow image value is invalid"),
    ("backend_error", "Comfy rejected the prompt submission before the job was accepted"),
    ("backend_error", "the request to cancel the backend prompt failed"),
    ("backend_error", "the backend returned HTTP 500 while submitting the generation"),
    ("backend_error", "Helix could reach the worker but the backend would not accept the request"),
    ("worker_unavailable", "the production worker cannot be reached"),
    ("worker_unavailable", "connection to the RTX worker was refused"),
    ("worker_unavailable", "Comfy on the production worker appears offline"),
    ("worker_unavailable", "the worker stopped responding to runtime health checks"),
    ("job_failure", "the running generation exceeded its execution timeout"),
    ("job_failure", "Comfy history reports that the accepted generation failed"),
    ("job_failure", "the media job started but ended with an execution error"),
    ("job_failure", "generation was running and then entered failed state"),
    ("delivery_failure", "Telegram sendDocument failed after every delivery retry"),
    ("delivery_failure", "the artifact was generated but could not be sent to the operator"),
    ("delivery_failure", "delivery exhausted all retry attempts"),
    ("delivery_failure", "the output exists, but sending the file failed"),
    ("advisory_diagnostic", "the events WebSocket probe timed out but queue and history still work"),
    ("advisory_diagnostic", "an optional event-socket health check failed while the runtime remains ready"),
    ("advisory_diagnostic", "the advisory WebSocket diagnostic timed out; core polling is healthy"),
    ("advisory_diagnostic", "event streaming is unavailable but queue and history reconciliation still work"),
    ("unknown_error", "the database connection was unexpectedly closed"),
    ("unknown_error", "could not parse an unrelated upstream metadata payload"),
    ("unknown_error", "the host filesystem reported an unexpected read error"),
    ("unknown_error", "an unclassified internal exception occurred in a non-media service"),
]
for index, (family, text) in enumerate(ERROR_CASES, 1):
    CASES.append(make_case("error_semantic", family, f"error-{index}", text, {"category": family}, SYSTEM_ERROR, ERROR_SCHEMA))

# E. Experimental settings.
ASPECT_CASES = [
    ("16:9", "make it widescreen"), ("16:9", "use landscape format"),
    ("16:9", "horizontal cinematic frame"), ("16:9", "give me a 16 by 9 video"),
    ("9:16", "make it vertical"), ("9:16", "use portrait format"),
    ("9:16", "phone-first vertical video"), ("9:16", "give me a 9 by 16 frame"),
    ("1:1", "make it square"), ("1:1", "use a one-to-one frame"),
    ("1:1", "square social format"), ("1:1", "I want a 1:1 video"),
]
for index, (value, text) in enumerate(ASPECT_CASES, 1):
    CASES.append(make_case("setting_aspect", value, f"aspect-{index}", text, {"aspect_ratio": value}, SYSTEM_ASPECT, ASPECT_SCHEMA, experimental=True))

DURATION_CASES = [
    (4, "make it four seconds long"), (5, "five second video"),
    (8, "set duration to 8 seconds"), (10, "I want a ten-second clip"),
    (12, "make this last twelve seconds"), (15, "duration should be 15 seconds"),
    (20, "make a twenty second video"), (30, "set it to half a minute"),
]
for index, (value, text) in enumerate(DURATION_CASES, 1):
    CASES.append(make_case("setting_duration", str(value), f"duration-{index}", text, {"duration_seconds": value}, SYSTEM_DURATION, DURATION_SCHEMA, experimental=True))

ENHANCE_CASES = [
    (True, "enhance my prompt before generation"), (True, "rewrite the prompt to improve it"),
    (True, "turn prompt enhancement on"), (True, "you can improve my wording before generation"),
    (False, "do not enhance my prompt"), (False, "keep my prompt exactly as written"),
    (False, "disable prompt rewriting"), (False, "use my wording unchanged"),
]
for index, (value, text) in enumerate(ENHANCE_CASES, 1):
    CASES.append(make_case("setting_enhance", str(value).lower(), f"enhance-{index}", text, {"prompt_enhancement": value}, SYSTEM_ENHANCE, ENHANCE_SCHEMA, experimental=True))

QUALITY_CASES = [
    ("higher", "use higher quality this time"), ("higher", "increase the resolution quality"),
    ("higher", "give me the better quality version"), ("higher", "spend more resources for better output"),
    ("lower", "lower the quality to save resources"), ("lower", "use a cheaper lower-resolution pass"),
    ("lower", "reduce the quality for this test"), ("lower", "make this a lighter lower quality run"),
    ("same", "keep the same quality as before"), ("same", "do not change the resolution quality"),
    ("same", "leave quality unchanged"), ("same", "use the existing quality level"),
]
for index, (value, text) in enumerate(QUALITY_CASES, 1):
    CASES.append(make_case("setting_quality", value, f"quality-{index}", text, {"quality_direction": value}, SYSTEM_QUALITY, QUALITY_SCHEMA, experimental=True))

COMBINED_SETTINGS_CASES = [
    ("vertical-8", "make it vertical and 8 seconds long", {"aspect_ratio": "9:16", "duration_seconds": 8}),
    ("wide-10-noenhance", "widescreen, ten seconds, and keep my prompt exactly as written", {"aspect_ratio": "16:9", "duration_seconds": 10, "prompt_enhancement": False}),
    ("portrait-better", "portrait format with higher quality", {"aspect_ratio": "9:16", "quality_direction": "higher"}),
    ("square-same", "make it square and keep the same quality", {"aspect_ratio": "1:1", "quality_direction": "same"}),
    ("low-5", "five seconds and lower quality to save resources", {"duration_seconds": 5, "quality_direction": "lower"}),
    ("vertical-enhance", "use vertical format and enhance my prompt", {"aspect_ratio": "9:16", "prompt_enhancement": True}),
    ("wide-12-better", "12 seconds, landscape, higher quality", {"duration_seconds": 12, "aspect_ratio": "16:9", "quality_direction": "higher"}),
    ("square-noenhance", "square video; do not rewrite the prompt", {"aspect_ratio": "1:1", "prompt_enhancement": False}),
    ("all-four", "make it vertical, 15 seconds, enhance the prompt, and use higher quality", {"aspect_ratio": "9:16", "duration_seconds": 15, "prompt_enhancement": True, "quality_direction": "higher"}),
    ("wide-low-noenhance", "landscape, lower quality, prompt unchanged", {"aspect_ratio": "16:9", "quality_direction": "lower", "prompt_enhancement": False}),
    ("duration-enhance", "make it 20 seconds and improve my prompt", {"duration_seconds": 20, "prompt_enhancement": True}),
    ("square-30-same", "square, thirty seconds, same quality as before", {"aspect_ratio": "1:1", "duration_seconds": 30, "quality_direction": "same"}),
]
for index, (family, text, expected) in enumerate(COMBINED_SETTINGS_CASES, 1):
    CASES.append(make_case("setting_combined", family, f"combined-{index}", text, expected, SYSTEM_SETTINGS_COMBINED, SETTINGS_COMBINED_SCHEMA, experimental=True))


def out(*args):
    print(*args, flush=True)


def http_json(method, path, payload=None, timeout=45):
    data = None
    headers = {}
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"
    request = urllib.request.Request(BASE_URL + path, data=data, headers=headers, method=method)
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
        subprocess.check_output(["pgrep", "-x", "helixai-adapter"], stderr=subprocess.DEVNULL)
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
    return values[low] * (1 - fraction) + values[high] * fraction


def start_server(model, label):
    log_path = Path("/tmp") / f"{model['name']}-v6-{label}.log"
    log = open(log_path, "w")
    proc = subprocess.Popen(
        [SERVER, "-hf", model["hf"], "-t", THREADS, "-c", CONTEXT, "--host", "127.0.0.1", "--port", str(PORT)],
        stdout=log,
        stderr=subprocess.STDOUT,
    )
    if not wait_ready(proc):
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill(); proc.wait()
        log.close()
        raise RuntimeError(f"server failed to start; see {log_path}")
    return proc, log, log_path


def stop_server(proc, log):
    proc.terminate()
    try:
        proc.wait(timeout=10)
    except subprocess.TimeoutExpired:
        proc.kill(); proc.wait()
    log.close()
    time.sleep(0.5)


def call_model(model, case_data, max_tokens=64):
    payload = {
        "model": model["api"],
        "temperature": 0,
        "max_tokens": max_tokens,
        "response_format": {
            "type": "json_schema",
            "json_schema": {"name": "helix_adapter_result", "schema": case_data["schema"]},
        },
        "messages": [
            {"role": "system", "content": case_data["system"]},
            {"role": "user", "content": case_data["text"]},
        ],
    }
    if model["reasoning_none"]:
        payload["reasoning_effort"] = "none"

    started = time.perf_counter()
    try:
        response = http_json("POST", "/v1/chat/completions", payload, timeout=60)
    except Exception as exc:
        return {"got": None, "content": None, "error": str(exc), "wall_ms": (time.perf_counter() - started) * 1000, "generation_tps": None}

    wall_ms = (time.perf_counter() - started) * 1000
    content = None
    got = None
    try:
        content = response["choices"][0]["message"]["content"]
        got = json.loads(content)
    except Exception:
        pass
    timings = response.get("timings", {})
    return {"got": got, "content": content, "error": None, "wall_ms": wall_ms, "generation_tps": timings.get("predicted_per_second")}


def warmup(model):
    call_model(model, make_case("warmup", "status", "warmup", "show runtime status", {"intent": "status"}, SYSTEM_INTENT, INTENT_SCHEMA))


def semantic_run(model):
    proc, log, log_path = start_server(model, "semantic")
    out(f"Ready. PID={proc.pid} RSS={rss_mb(proc.pid):.0f} MB")
    out("Warm-up...")
    warmup(model)
    loaded_rss = rss_mb(proc.pid)
    records = []
    max_rss = loaded_rss

    try:
        grouped = defaultdict(list)
        for case_data in CASES:
            grouped[case_data["group"]].append(case_data)
        order = ["intent", "correction", "tool_context", "error_semantic", "setting_aspect", "setting_duration", "setting_enhance", "setting_quality", "setting_combined"]

        for group in order:
            rows = grouped[group]
            suffix = " [EXPERIMENTAL]" if rows[0]["experimental"] else ""
            out(); out(f"{group.upper()}{suffix}"); out("-" * 82)
            correct = 0
            for case_data in rows:
                result = call_model(model, case_data)
                got = result["got"]
                ok = got == case_data["expected"]
                correct += int(ok)
                current_rss = rss_mb(proc.pid)
                max_rss = max(max_rss, current_rss)
                records.append({
                    "group": case_data["group"], "family": case_data["family"], "experimental": case_data["experimental"],
                    "case_name": case_data["name"], "text": case_data["text"], "expected": case_data["expected"], "got": got,
                    "ok": ok, "error": result["error"], "wall_ms": result["wall_ms"], "generation_tps": result["generation_tps"], "rss_mb": current_rss,
                })
                if not ok:
                    out(f"FAIL {case_data['name']}: expected={json.dumps(case_data['expected'], separators=(',', ':'))} got={json.dumps(got, separators=(',', ':'))}")
            out(f"Group: {correct}/{len(rows)} ({100*correct/len(rows):.1f}%)")
    finally:
        stop_server(proc, log)

    return {"loaded_rss_mb": loaded_rss, "max_rss_mb": max_rss, "records": records, "server_log": str(log_path)}


def summarize(records):
    summary = {}
    grouped = defaultdict(list)
    for row in records:
        grouped[row["group"]].append(row)

    for group, rows in grouped.items():
        correct = sum(int(r["ok"]) for r in rows)
        latencies = [r["wall_ms"] for r in rows if r.get("wall_ms") is not None]
        tps = [r["generation_tps"] for r in rows if r.get("generation_tps") is not None]
        by_family = defaultdict(list)
        for row in rows:
            by_family[row["family"]].append(row["ok"])
        robust_families = sum(1 for values in by_family.values() if values and all(values))
        summary[group] = {
            "correct": correct, "total": len(rows), "accuracy": correct / len(rows) if rows else 0.0,
            "robust_families": robust_families, "family_count": len(by_family),
            "p50_ms": percentile(latencies, 0.50), "p95_ms": percentile(latencies, 0.95),
            "generation_tps": statistics.mean(tps) if tps else 0.0,
        }
    return summary


def stress_case(schema):
    return {"schema": schema, "system": "Classify this Helix operator request. Return only the typed JSON result.", "text": "show recent jobs"}


def same_schema_stress(model):
    proc, log, log_path = start_server(model, "stress-same")
    warmup(model)
    start_rss = rss_mb(proc.pid)
    checkpoints = {}
    max_rss = start_rss
    schema = enum_schema("intent", ["status", "queue", "jobs", "errors", "help"])
    case_data = stress_case(schema)
    try:
        for i in range(1, STRESS_CALLS + 1):
            call_model(model, case_data, max_tokens=32)
            current = rss_mb(proc.pid)
            max_rss = max(max_rss, current)
            if i in {1, 12, 24, 48, 96, STRESS_CALLS}:
                checkpoints[str(i)] = current
        end_rss = rss_mb(proc.pid)
    finally:
        stop_server(proc, log)
    return {"start_rss_mb": start_rss, "end_rss_mb": end_rss, "max_rss_mb": max_rss, "delta_mb": end_rss - start_rss, "checkpoints": checkpoints, "server_log": str(log_path)}


def rotating_schema_stress(model):
    proc, log, log_path = start_server(model, "stress-rotating")
    warmup(model)
    start_rss = rss_mb(proc.pid)
    checkpoints = {}
    max_rss = start_rss
    schemas = []
    for index in range(ROTATING_SCHEMAS):
        key = f"intent_{index:02d}"
        values = ["status", "queue", "jobs", "errors", "help"]
        shift = index % len(values)
        values = values[shift:] + values[:shift]
        schemas.append({"type": "object", "properties": {key: {"type": "string", "enum": values}}, "required": [key], "additionalProperties": False})
    try:
        for i in range(1, STRESS_CALLS + 1):
            call_model(model, stress_case(schemas[(i - 1) % len(schemas)]), max_tokens=32)
            current = rss_mb(proc.pid)
            max_rss = max(max_rss, current)
            if i in {1, 12, 24, 48, 96, STRESS_CALLS}:
                checkpoints[str(i)] = current
        end_rss = rss_mb(proc.pid)
    finally:
        stop_server(proc, log)
    return {"start_rss_mb": start_rss, "end_rss_mb": end_rss, "max_rss_mb": max_rss, "delta_mb": end_rss - start_rss, "checkpoints": checkpoints, "unique_schemas": ROTATING_SCHEMAS, "server_log": str(log_path)}


def pct(summary, key):
    return 100 * summary.get(key, {}).get("accuracy", 0.0)


def main():
    if adapter_running():
        out("A helixai-adapter process is already running.")
        out("Stop it first, then rerun V6.")
        sys.exit(1)

    core_cases = sum(1 for c in CASES if not c["experimental"])
    settings_cases = sum(1 for c in CASES if c["experimental"])
    out(); out("HELIX AI ADAPTER BENCHMARK V6"); out("Corrected ambiguity-boundary benchmark"); out()
    out(f"Models:                 {len(MODELS)}")
    out(f"Core semantic cases:    {core_cases}/model")
    out(f"Settings cases*:        {settings_cases}/model")
    out(f"Same-schema stress:     {STRESS_CALLS} calls/model")
    out(f"Rotating-schema stress: {STRESS_CALLS} calls/model ({ROTATING_SCHEMAS} unique schemas)")
    out(); out("Removed from scoring: exact IDs, exact machine error codes, separate clarify/proceed checks, slash commands, yes/no, database truth.")
    out("* settings remain experimental")

    all_results = []
    for model in MODELS:
        out(); out("=" * 100); out(model["name"]); out("=" * 100)
        try:
            semantic = semantic_run(model)
            summary = summarize(semantic["records"])
            core_groups = ["intent", "correction", "tool_context", "error_semantic"]
            core_correct = sum(summary[g]["correct"] for g in core_groups)
            core_total = sum(summary[g]["total"] for g in core_groups)
            core_accuracy = core_correct / core_total
            settings_groups = ["setting_aspect", "setting_duration", "setting_enhance", "setting_quality", "setting_combined"]
            settings_correct = sum(summary[g]["correct"] for g in settings_groups)
            settings_total = sum(summary[g]["total"] for g in settings_groups)
            settings_accuracy = settings_correct / settings_total
            latencies = [r["wall_ms"] for r in semantic["records"] if not r["experimental"] and r.get("wall_ms") is not None]

            out(); out("SEMANTIC SUMMARY"); out("-" * 100)
            for group in core_groups + settings_groups:
                row = summary[group]
                marker = " *" if group.startswith("setting_") else ""
                out(f"{group:20} {row['correct']:3}/{row['total']:<3} {100*row['accuracy']:6.1f}% robust families {row['robust_families']}/{row['family_count']}{marker}")
            out(); out(f"CORE semantic accuracy: {100*core_accuracy:.1f}%")
            out(f"SETTINGS accuracy*:     {100*settings_accuracy:.1f}%")
            out(f"Core latency p50/p95:   {percentile(latencies,0.50):.0f}/{percentile(latencies,0.95):.0f} ms")
            out(f"Semantic RSS load/max:  {semantic['loaded_rss_mb']:.0f}/{semantic['max_rss_mb']:.0f} MB")

            out(); out("MEMORY STRESS — SAME SCHEMA"); out("-" * 100)
            same = same_schema_stress(model)
            out(f"start={same['start_rss_mb']:.0f} MB end={same['end_rss_mb']:.0f} MB delta={same['delta_mb']:+.0f} MB max={same['max_rss_mb']:.0f} MB")
            out("checkpoints:", json.dumps(same["checkpoints"], separators=(",", ":")))

            out(); out("MEMORY STRESS — ROTATING SCHEMAS"); out("-" * 100)
            rotating = rotating_schema_stress(model)
            out(f"start={rotating['start_rss_mb']:.0f} MB end={rotating['end_rss_mb']:.0f} MB delta={rotating['delta_mb']:+.0f} MB max={rotating['max_rss_mb']:.0f} MB")
            out("checkpoints:", json.dumps(rotating["checkpoints"], separators=(",", ":")))

            all_results.append({
                "model": model, "core_accuracy": core_accuracy, "settings_accuracy": settings_accuracy,
                "core_p50_ms": percentile(latencies, 0.50), "core_p95_ms": percentile(latencies, 0.95),
                "semantic_loaded_rss_mb": semantic["loaded_rss_mb"], "semantic_max_rss_mb": semantic["max_rss_mb"],
                "summary": summary, "records": semantic["records"], "memory_same_schema": same, "memory_rotating_schema": rotating,
            })
        except Exception as exc:
            out("MODEL FAILED:", exc)
            all_results.append({"model": model, "error": str(exc)})

    RESULTS_FILE.write_text(json.dumps(all_results, indent=2))
    valid = [r for r in all_results if "error" not in r]
    valid.sort(key=lambda r: (-r["core_accuracy"], r["core_p50_ms"], r["semantic_max_rss_mb"]))

    out(); out("=" * 130); out("FINAL COMPARISON V6"); out("=" * 130)
    out(f"{'Model':25} {'Core':>7} {'Intent':>8} {'Correct':>8} {'ToolCtx':>8} {'ErrorSem':>9} {'Settings*':>10} {'P50':>8} {'P95':>8} {'SemRSS':>8} {'SameΔ':>8} {'RotateΔ':>9}")
    out("-" * 130)
    for result in valid:
        s = result["summary"]
        out(f"{result['model']['name']:25} {100*result['core_accuracy']:6.1f}% {pct(s,'intent'):7.1f}% {pct(s,'correction'):7.1f}% {pct(s,'tool_context'):7.1f}% {pct(s,'error_semantic'):8.1f}% {100*result['settings_accuracy']:9.1f}% {result['core_p50_ms']:7.0f}m {result['core_p95_ms']:7.0f}m {result['semantic_max_rss_mb']:7.0f}M {result['memory_same_schema']['delta_mb']:+7.0f}M {result['memory_rotating_schema']['delta_mb']:+8.0f}M")

    out(); out("Core = intent + correction/negation + context-aware media-tool routing + broad semantic error interpretation.")
    out("Settings* = aspect + duration + prompt enhancement + quality + combined extraction; still experimental.")
    out("SameΔ vs RotateΔ isolates whether many structured-output schemas cause sustained RSS growth.")
    out(); out("Raw results:", RESULTS_FILE)


if __name__ == "__main__":
    main()
