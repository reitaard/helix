# Project State

## Current phase

**Preparation / foundation, with a validated Production execution slice, a narrow Telegram operator surface, a proven native LTX 2.5 T2V input/output loop, a controlled native T2V quality baseline, and a persisted semantic T2V settings/reset layer.**

The high-level Helix system division is established. Production execution is hardened enough to operate as a stable checkpoint while generation research continues independently and the project advances the main Helix brain path.

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
    ├── T2V settings + reset services
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
- durable T2V prompt capture and pre-submit confirmation;
- persisted T2V Core/Advanced settings;
- durable T2V Core/full reset confirmation.

## Telegram operator checkpoint

Current advertised commands remain:

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
prompt preview + resolved settings snapshot
  ↓
awaiting_confirmation
  ↓ yes
video.t2v
```

Pending T2V state is durable in `operator_pending_t2v`. The prompt window is five minutes and the confirmation window is 60 seconds. Three invalid confirmation responses abort. A new slash command abandons the pending T2V action. No media job exists until `yes` is confirmed.

The confirmed settings snapshot is used for submission so a later profile change cannot silently alter a generation that was already previewed.

## T2V settings checkpoint

The stable semantic T2V settings surface is now implemented for the Production profile/tool pair:

```text
Christopher Nolan
└── video.t2v
```

Core authority:

```text
asp   Aspect
qual  Quality
time  Duration
enh   Prompt Enhance
```

Advanced authority requires explicit `-dev`:

```text
fps    FPS
seed   Stage 1 seed
seed2  Stage 2 seed
neg    Negative prompt
mp     Megapixel override
samp   Sampler
cfg    Guidance
```

`-dev` is a superset authority and can also inspect/change Core controls. There is no persistent Dev toggle.

Exact default/test baseline:

```text
Aspect       16:9
Quality      Standard -> 0.9 MP effective
Duration     5 s
Enhance      OFF
FPS          24
Stage1 seed  558811532553686
Stage2 seed  42
Negative     pc game, console game, video game, cartoon, childish, ugly
MP override  none / quality-derived
Sampler      euler_ancestral
Guidance     1.0
```

The baseline produces `1280x704` on the current workflow because resolution is derived from aspect + megapixels and snapped to the workflow's internal multiple-of-32 requirement.

Migration `0007_t2v_profile_settings.sql` persists the profile settings. The workflow binder maps only the proven semantic controls into the vetted T2V graph; model files, sigmas, decoder tiling, bit depth and other template plumbing remain outside the user-facing settings contract.

### Reset

```text
/t2v reset
→ reset Core only

/t2v reset -dev
→ reset the full exposed T2V profile
```

Reset requires durable `yes/no` confirmation and shows only values that will actually change. The full reset includes the default negative prompt, both seeds, sampler and guidance, but does not rewrite workflow/template internals.

Migration `0008_t2v_reset_confirmations.sql` persists reset intent/snapshots so a runtime restart does not create ambiguous state during the confirmation window.

## Native LTX 2.5 T2V research checkpoint

A controlled native T2V benchmark has been run across 5-second, 8-second and 10-second durations before adding Director or Prompt Relay.

Validated native outputs:

```text
5 s  -> 121 frames @ 24 fps -> ~5.04 s
8 s  -> 193 frames @ 24 fps -> ~8.04 s
10 s -> 241 frames @ 24 fps -> ~10.04 s
native output: 1280x704
```

Key findings:

- native LTX already performs meaningful semantic temporal allocation, camera/action planning, native hard cuts and joint AV generation;
- continuous vehicle/camera shots, motorcycle POV, focused human acting and performance/music scenes are strong native territory;
- exact collision geometry, strict multi-object physical causality, exact reflection geometry, dense low-level sub-action tracking and guaranteed final-state completion remain unreliable;
- 8 seconds currently gives the best balance for richer native single-shot research; 5 seconds remains useful for compact/high-motion ideas and is the exact default/test baseline;
- 10 seconds should be used only when the scene genuinely contains enough evolving action;
- longer duration can produce temporal dilation rather than more completed events;
- natural overlapping causal language often produces better acting than rigid `ONLY AFTER X -> Y` sequencing;
- explicit visual post-state wording can improve persistence, but clause-by-clause adherence and finished-video quality must be scored separately;
- subtle ambience is less reliable than dominant sound sources;
- a hard cut is not enough: multishot prompts work better when each shot has a distinct narrative/job function.

Full findings and prompt/control policy are recorded in `production/ltx-director/NATIVE_T2V.md`.

Model-quality evaluation should use the native Comfy artifact or a verified original-file document path. Transformed preview files can contaminate motion/detail comparison.

## Production workflow policy

The runtime now has a narrow semantic settings contract, but it still must not become a raw mirror of the Comfy graph.

```text
vetted Comfy API workflow
        ↓
semantic profile settings
        ↓
optional future generation mode
        ↓
workflow binder
        ↓
helix-runtime execution
```

Native LTX should be tried first for shots within its proven comfort zone. LTX Director/Prompt Relay should be introduced when native prompting repeatedly fails required timing, shot responsibilities, state changes or structured progression rather than being added automatically to every shot.

## Next Production phases

### 1. Generation mode contract

Design a named mode/preset layer above the existing settings profile. There is no mode system today.

Candidate labels such as `fast`, `quality`, `baseline/default` and `auto` are not yet locked. Define first:

- mode persistence vs per-generation selection;
- which settings a mode controls;
- override precedence between a mode and explicit settings;
- confirmation/reset behavior;
- versioning for experiment reproducibility.

Manual/custom settings must remain available.

### 2. Controlled mode calibration

Benchmark candidate bundles with fixed prompts/seeds and native artifacts. Measure runtime, finished-video quality, motion/coherence, prompt adherence, audio behavior and action completion.

Do not assume `8 s = quality` or `5 s = fast`; the existing duration findings are evidence about temporal behavior, not a finished mode definition.

### 3. Explicit named modes

Keep only modes that prove a repeatable production tradeoff. Avoid creating many cosmetic presets.

### 4. Auto resolver

`auto` should resolve semantic scene requirements to a proven mode/settings bundle. Start deterministic. Later an AI semantic adapter may assist, but it should not directly mutate workflow node plumbing.

### 5. Prompt Enhance ON/OFF evaluation

Run controlled A/B tests after the settings/mode foundation is stable. Preserve the raw prompt and resolved settings for comparison.

### 6. Targeted Director / Prompt Relay retest

Test stronger control only against native failure classes that remain important: strict beat timing, persistent state change, shot responsibility, structured multi-shot progression and similar requirements.

### 7. Production contract freeze

When native T2V, modes and targeted control layers are understood:

- freeze/version the stable workflow family;
- document semantic bindings/defaults;
- expose the same Production contract to Telegram, n8n and later Helix Director callers;
- keep node IDs/backend details behind the Production binder/adapter.

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
- [x] Implement the stable Core/Advanced T2V settings contract.
- [x] Implement durable Core/full T2V reset confirmation.
- [ ] Design and benchmark generation modes/presets.
- [ ] Run controlled Prompt Enhance ON/OFF evaluation.
- [ ] Re-test LTX Director / Prompt Relay only against native limitations that need stronger control.
- [ ] Validate real Windows reboot/AtStartup behavior for the ComfyUI worker.

## Next Helix brain phase

**Niche Intelligence design.**

The Production work above remains a parallel execution/research track. The brain phase should define:

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
