# Helix AI Adapter Benchmark

This folder contains the local-model benchmark used to evaluate a tiny semantic adapter for Helix.

The adapter is intentionally **not** a general chat layer and does not receive every Telegram or application message.

## Boundary

```text
exact command / exact confirmation / known deterministic state
        ↓
Helix code

natural-language ambiguity / extraction / interpretation
        ↓
helixai-adapter
        ↓
small typed result
        ↓
Helix validates state and executes deterministically
```

The model should interpret language. It should not own job truth, worker truth, authorization, database lookup, confirmation state, or execution.

## Deterministic paths that should bypass the model

Current exact Telegram commands already have deterministic handlers and are not useful model-selection tests:

- `/status`
- `/queue`
- `/jobs`
- `/job <id>`
- `/outbox`
- `/errors`
- `/events <id>`
- `/t2v`
- `/cancel <id>`
- `/help`
- exact `yes` / `no` while an existing confirmation state is pending

Job-prefix validation also remains deterministic through `resolveJobReference()`. The model may extract a reference string, but Helix decides whether that reference is invalid, missing, ambiguous, or uniquely resolved.

## Benchmark skills

V5 measures small adapter responsibilities rather than asking one model to reconstruct a whole Helix action object.

### 1. Natural command intent

Examples:

```text
"what is waiting on the gpu?"        -> queue
"show me recent failures"            -> errors
"what happened to b270ee?"           -> job
"show the timeline for b270ee"       -> events
```

### 2. Reference extraction

Examples:

```text
"show job_b270ee..."                  -> job_b270ee...
"cancel e2a4a9"                       -> e2a4a9
```

The extracted string is passed to deterministic Helix resolution.

### 3. Media-tool interpretation

Current runtime tools:

```text
video.i2v
video.t2v
```

Examples:

```text
"animate this image"                  -> video.i2v
"make a video from this description" -> video.t2v
```

### 4. Correction / negation

Examples:

```text
"cancel that—no, just show the job"   -> job
"show the job, actually the events"   -> events
```

### 5. Missing-information detection

Examples:

```text
"cancel the job"                      -> clarify
"show what happened to it"            -> clarify
```

Helix should not guess destructive or reference-dependent targets.

### 6. Runtime/error interpretation

The benchmark uses error families that exist in the current runtime/operator surface, including:

- worker not found;
- invalid workflow input;
- backend submission failure;
- backend cancellation failure;
- job not found;
- ambiguous job prefix/reference;
- worker offline/degraded diagnostics;
- job failed / timed out;
- delivery failure;
- advisory diagnostic timeout.

This is classification/advisory interpretation only. The model does not mutate runtime state.

## Production settings map

The current native T2V path is intentionally narrow. The proven workflow keeps most controls fixed and only exposes the prompt through the current Telegram flow.

The repository identifies the next small semantic Production settings surface as:

```text
aspect ratio
quality / resolution preset
duration
prompt enhancement
```

For benchmark purposes V5 tests **semantic extraction**, not a frozen execution contract:

| User meaning | Benchmark value | Production status |
| --- | --- | --- |
| widescreen / landscape | `16:9` | current proven baseline is 16:9 |
| vertical / portrait | `9:16` | semantic test only; final runtime enum/binder is not frozen |
| square | `1:1` | semantic test only; final runtime enum/binder is not frozen |
| explicit duration | integer seconds | duration is planned as a stable semantic control |
| enhance/rewrite prompt | boolean | planned semantic control; current proven workflow keeps enhancement off |
| higher/lower/same quality | direction only | final quality/resolution preset names are not frozen |

The benchmark deliberately does **not** make the tiny model choose raw Comfy node IDs, sampler/scheduler values, model files, seeds, negative prompts, or backend-specific workflow parameters. Those remain internal/advanced unless later experiments promote them to stable Helix semantics.

FPS is also not treated as a current operator setting in this benchmark; the current baseline remains 24 fps.

## Result interpretation

V5 reports a capability map rather than one opaque score:

```text
intent
reference extraction
tool routing
correction / negation
ambiguity detection
error classification
settings extraction (experimental)
```

It also records latency, generation throughput and resident memory.

A production choice should prioritize the skills actually used at ambiguity boundaries rather than generic free-form capability.
