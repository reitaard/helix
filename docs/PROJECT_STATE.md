# Project State

## Current phase

**Preparation / foundation, with a validated Production execution slice, a narrow Telegram operator surface, a proven native LTX 2.5 T2V input/output loop, and a controlled native T2V quality baseline.**

The high-level Helix system division is established. Production execution is hardened enough to pause as a stable checkpoint while generation research continues independently and the project returns to the main Helix brain path.

## Primary system direction

```text
Niche Intelligence -> Director -> Experiment Engine
```

Production/generation remains a separate workstream connected later through stable creative/variant briefs. Generation technology must not shape the Intelligence or Helix Director contracts.

The current Production generation direction is **open/self-hosted first**. Runway is not part of the active plan. Seedance 2.0 is currently a behavioral/quality reference for understanding prompt interpretation, temporal planning, continuity, and packaged-model behavior; it is not an active provider dependency.

## Project divisions

- Foundation / Preparation
- Intelligence
- Director
- Experiment Engine
- Production
- Distribution
- Analytics / Feedback

## Active Production checkpoint

Current status as of 2026-08-25:

```text
caller / n8n / Telegram
    ↓
helix-runtime :8787
    ├── helix-db
    ├── TelegramCommandService
    ├── TelegramAlertService
    ├── TelegramCancelService
    ├── TelegramT2VService
    ├── OutboxRepository
    ↓
ComfyAdapter / ComfyClient
    ↓ Tailscale
helix-rtx4060-01
    ↓
ComfyUI :8188
    ↓
generated artifact
    ↓
VPS temporary spool
    ↓
Telegram original document + caption
```

Current worker identity/runtime facts:

```text
durable worker ID: helix-rtx4060-01
display name: Christopher Nolan
ComfyUI: 0.33.0
Comfy revision: 7dde56176efa71fd74ef7b3930ab5882d1926288
Python: 3.12.11
PyTorch: 2.10.0+cu130
GPU: RTX 4060
validated tools: video.i2v, video.t2v
max GPU jobs: 1
```

The VPS-side runtime supports:

- durable media-job acceptance and PostgreSQL state;
- raw Comfy API-workflow submission;
- explicit job tool persistence (`video.i2v`, `video.t2v`);
- Comfy `prompt_id` persistence as backend job ID;
- queue/history reconciliation and restart recovery;
- race-safe terminal transitions;
- prompt-specific cancellation and running-job timeout;
- artifact discovery/retrieval and ffprobe metadata;
- durable Telegram original-file delivery;
- delivery retry/backoff, stale-claim recovery and terminal retry limits;
- immediate VPS spool cleanup after delivery attempts;
- human-friendly worker naming without changing durable IDs;
- live Comfy/Python/Torch/GPU/VRAM/RAM diagnostics;
- read-only pinned-Comfy revision comparison against upstream `master`;
- durable operator alerts and debug views;
- confirmed job cancellation;
- durable T2V prompt capture and pre-submit confirmation.

## Telegram operator checkpoint

Current advertised commands:

```text
/status      diagnostics
/queue       current Comfy + Helix queue state
/jobs        five most recent jobs with full durable IDs
/job <id>    one job plus its Outbox/send state
/outbox      send work still needing attention
/errors      recent generation/terminal-delivery failures
/events <id> complete durable event timeline
/t2v         confirmed native LTX 2.5 generation
/cancel <id> confirmed job cancellation
/help        command list
```

Hidden aliases:

```text
/st, /stat   -> /status
/qu, /que    -> /queue
/jbs         -> /jobs
/jb          -> /job
/ob          -> /outbox
/err         -> /errors
/ev          -> /events
/cc          -> /cancel
/h           -> /help
```

The service accepts messages only from the configured Telegram chat ID. It does not expose restart, shell, package update, or arbitrary worker mutation actions.

### Read-only inspection

`/jobs` shows full durable job IDs. `/job` and `/events` accept full IDs or unique short prefixes and reject ambiguous prefixes.

`/outbox` is presentation-only. It reads `media_deliveries` without claiming, retrying, resetting, or mutating delivery state. `DeliveryWorker` remains responsible for delivery execution.

`/errors` shows the five most recent failed/timed-out generation jobs and terminal Outbox failures. Cancelled jobs are excluded.

`/events <id>` shows the complete durable `media_job_events` timeline, newest first, with sequence numbers, Helix-local timestamps, and actual technical event names.

### Operational alerts

`TelegramAlertService` proactively sends alerts for:

```text
job.failed
job.timed_out
terminal delivery.failed
worker offline
worker recovered
```

Event-derived alerts are persisted in `operator_alerts`, deduplicated by durable keys, and delivered with bounded retry. Worker liveness alerts require consecutive observations and a cooldown.

### Safe cancellation

`/cancel <id>` and hidden alias `/cc` use durable terminal-style confirmation:

```text
/cancel <id>
      ↓
durable pending action
      ↓
60-second confirmation window
      ↓
yes / no
```

Three invalid responses abort the request, a new slash command abandons pending confirmation, expiry is quiet, and confirmed cancellation delegates to `JobService.cancel()` rather than calling ComfyUI directly.

### Confirmed T2V input

`/t2v` separates prompt entry from GPU execution:

```text
/t2v
  ↓
awaiting_prompt
  ↓
prompt preview
  ↓
awaiting_confirmation
  ↓ yes
video.t2v
```

Pending T2V state is durable in `operator_pending_t2v`. The prompt window is five minutes and the confirmation window is 60 seconds. Three invalid confirmation responses abort. A new slash command abandons the pending T2V action. No media job exists until `yes` is confirmed.

The current native LTX 2.5 T2V semantic surface is deliberately prompt-only. Helix mutates `405:376.inputs.value` and verifies that prompt enhancement at `405:383` remains disabled. The deployed runtime baseline remains fixed at 16:9 / 0.9 MP / 24 fps / 5 seconds until the T2V settings contract is explicitly designed. Experimental quality research has separately established 8 seconds as the strongest current general-purpose native test duration for richer single-shot scenes.

Worker state no longer treats a transient Comfy WebSocket-events timeout as execution failure by itself. Runtime, queue and capability checks determine execution readiness; event-socket failure remains visible as an advisory diagnostic.

## Proven Production runs

Runtime-controlled LTX 2.5 I2V generation remains proven, including:

```text
Helix job:    job_e2a4a9efff7a47b8b70cd41c068073ac
Result:       succeeded
Artifact:     video/LTX-2.5_i2v_00005_.mp4
```

The first native T2V production loop is also proven:

```text
Helix job:    job_b270eea4177746d881c0c96d0f2f4b35
Tool:         video.t2v
Result:       succeeded
Runtime:      4m 10s
Artifact:     video/LTX_2.5_t2v_00001_.mp4
Video:        1280x704 · 5.0s
Audio:        present
Delivery:     Telegram, 1 attempt
Worker:       Christopher Nolan
```

This proves Telegram intent -> Helix durable job -> native LTX 2.5 generation -> artifact reconciliation -> original-file Telegram delivery.

The durable pre-submit confirmation layer was added after the successful generation proof so future prompt entry does not immediately spend GPU time.

## Native LTX 2.5 T2V research checkpoint

A controlled native T2V benchmark has now been run across 5-second, 8-second and 10-second durations before adding Director or Prompt Relay.

Validated native outputs:

```text
5 s  -> 121 frames @ 24 fps -> ~5.04 s
8 s  -> 193 frames @ 24 fps -> ~8.04 s
10 s -> 241 frames @ 24 fps -> ~10.04 s
native output: 1280x704
```

The key findings are:

- native LTX already performs meaningful semantic temporal allocation, camera/action planning, native hard cuts and joint AV generation;
- continuous vehicle/camera shots, motorcycle POV, focused human acting and performance/music scenes are strong native territory;
- exact collision geometry, strict multi-object physical causality, exact reflection geometry, dense low-level sub-action tracking and guaranteed final-state completion remain unreliable;
- 8 seconds currently gives the best balance for richer native single-shot research; 5 seconds remains useful for compact/high-motion ideas and 10 seconds should be used only when the scene genuinely contains enough evolving action;
- longer duration can produce temporal dilation rather than more completed events;
- natural overlapping causal language often produces better acting than rigid `ONLY AFTER X -> Y` sequencing;
- explicit visual post-state wording can improve persistence, but clause-by-clause adherence and finished-video quality must be scored separately;
- subtle ambience is less reliable than dominant sound sources such as engines, voice/music, or discrete impacts;
- a hard cut is not enough: multishot prompts work better when each shot has a distinct narrative/job function.

The strongest quality-oriented native 8-second batch included:

```text
sports-car coastal tracking -> strongest complete native result
singer performance           -> strong audiovisual/performance result
cafe acting/dialogue         -> excellent visual acting, weak subtle ambience
motorcycle mountain POV      -> credible continuous T2V vehicle world
train-station multishot      -> good visual edit, weak audio
```

Full findings and current prompt/control policy are recorded in `production/ltx-director/NATIVE_T2V.md`.

One operational evaluation rule is now explicit: benchmark the native Comfy artifact, not a transformed preview. Earlier Telegram-delivered copies were observed with changed resolution/frame cadence compared with the native files, which is enough to contaminate quality comparison. The intended `sendDocument` original-file path must remain verified end-to-end.

## Production workflow policy

The runtime is intentionally not being expanded into a large semantic workflow API while generation graphs are still changing.

```text
raw Comfy API workflow
        ↓
helix-runtime execution
        ↓
continue I2V / T2V workflow research in ComfyUI
        ↓
choose stable workflow families
        ↓
freeze/version those graphs
        ↓
add semantic Helix bindings around proven controls
```

Native LTX should be tried first for shots within its proven comfort zone. LTX Director/Prompt Relay should be introduced when native prompting repeatedly fails required timing, shot responsibilities, state changes or structured progression rather than being added automatically to every shot.

Still deferred:

- actual image upload/staging through `/upload/image`;
- broad prompt/chunk-prompt bindings;
- Prompt Relay/Director bindings;
- broader T2V settings beyond the fixed prompt-only runtime baseline;
- sampler/model tuning as stable user-facing semantics;
- persistent WebSocket execution tracking;
- worker output-retention deletion infrastructure;
- broader Telegram mutation commands.

One operational validation remains pending: the Windows scheduled task has been started successfully by hand, but a real reboot -> automatic ComfyUI worker startup has not yet been proven.

## Preparation checklist

- [ ] Keep sanitized n8n exports as workflows stabilize.
- [ ] Define common IDs and object names across system divisions.
- [ ] Define draft contracts for `Niche`, `ResearchFinding`, `NicheModel`, `ContentIdea`, `ContentSpec`, `Experiment`, `Variant`, `MediaAsset`, `PublishedPost`, and `PerformanceSnapshot`.
- [ ] Define evidence/provenance requirements for Intelligence research.
- [x] Establish durable Production state outside n8n for the active ComfyUI execution path.
- [x] Validate native LTX 2.5 I2V generation on the standalone worker.
- [x] Pin the standalone ComfyUI/custom-node execution stack.
- [x] Submit, track, recover and deliver a real generation through `helix-runtime`.
- [x] Add Telegram system status, queue, job, and Outbox visibility.
- [x] Add durable Telegram operational alerts and deduplication.
- [x] Add `/errors` and complete timestamped `/events` debug views.
- [x] Add safe durable `/cancel` + `/cc` confirmation flow.
- [x] Add live worker RAM/VRAM diagnostics and read-only Comfy upstream-drift awareness.
- [x] Validate a simple native LTX 2.5 T2V workflow and Telegram production loop.
- [x] Add durable T2V pre-submit confirmation.
- [x] Establish native 5/8/10-second T2V quality findings before Director/Prompt Relay retesting.
- [ ] Design the stable T2V settings contract using the native findings.
- [ ] Run controlled Prompt Enhance ON/OFF evaluation.
- [ ] Re-test LTX Director / Prompt Relay only against native limitations that need stronger control.
- [ ] Validate real Windows reboot/AtStartup behavior for the ComfyUI worker.

## Next Helix brain phase

**Niche Intelligence design.**

The next phase should define:

1. what exactly a `Niche` means in Helix;
2. which platform observations enter the Intelligence system;
3. what raw evidence is persisted from posts/reels/shorts/accounts/tags;
4. which structured features are extracted from each content example;
5. how hooks, formats, topics, pacing, visuals, narrative structure, audience signals, saturation, novelty and temporal trends are represented;
6. how observed facts are separated from inferred patterns;
7. what a `NicheModel` contains;
8. how the Director queries and consumes that model.

The intended research direction is platform-first rather than web-search-first: YouTube/Facebook/Reels-style data should provide primary behavioral evidence, scoped by niche/tags/accounts/content clusters, while broader web research supplements rather than replaces platform observations.

## Later

After the Intelligence contract is coherent:

1. Director skill design;
2. Experiment Engine algorithms;
3. connect the stable Production execution/workflow boundary;
4. Distribution;
5. closed-loop Analytics/Feedback.
