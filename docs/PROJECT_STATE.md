# Project State

Last documentation reconciliation: **2026-09-03**.

## Current phase

Helix remains in **Preparation / foundation**, with a mature single-worker Production execution slice and active Production research. The main brain-development order remains:

```text
Niche Intelligence -> Director -> Experiment Engine
```

Production/generation remains a separate workstream. It must expose stable semantic contracts upward rather than shaping Intelligence or Helix Director around ComfyUI, LTX, FLUX, or any other backend.

The current generation direction remains **open/self-hosted first**. Runway is not part of the active Production plan. Seedance-class systems are behavioral/quality references where useful.

## Active Production architecture

```text
caller / n8n / Telegram
    ↓
helix-runtime :8787
    ├── helix-db
    │   ├── workers + observations
    │   ├── media_jobs
    │   ├── media_references
    │   ├── media_job_events
    │   ├── media_deliveries
    │   ├── operator / Telegram state
    │   └── Production profile/settings state
    │
    ├── JobService / WorkerService
    ├── Telegram operator + generation services
    ├── DeliveryWorker
    └── Comfy adapter boundary
    ↓ Tailscale
helix-rtx4060-01
    ↓
ComfyUI :8188
```

Current worker facts:

```text
durable worker ID: helix-rtx4060-01
physical worker: Helix RTX 4060
GPU: RTX 4060
ComfyUI: 0.33.0
Comfy revision: 7dde56176efa71fd74ef7b3930ab5882d1926288
Python: 3.12.11
PyTorch: 2.10.0+cu130
physical GPU concurrency: 1
```

Logical Production Profiles share that one worker:

```text
nolan / Christopher Nolan
-> video.i2v
-> video.t2v

leibovitz / Annie Leibovitz
-> image.t2i
```

Profiles describe tool authority and operator presentation, not additional hardware or queues.

`lowry / John D. Lowry` is currently only a **research candidate** for future image/video upscale/restoration authority. It is not registered in `media-runtime`; no upscale tool is currently part of the Production contract.

## Operator media identity

Helix keeps internal, operator-facing, and backend identities separate:

```text
internal Helix job ID      job_...
operator media reference  52
Comfy execution ID         prompt_id
```

Migrations `0011_job_numbers.sql` and `0012_media_references.sql` established one durable numeric media-reference namespace shared by Helix jobs and direct/manual ComfyUI artifacts.

The invariant is:

```text
one number -> one media execution
```

Direct ComfyUI generations do not become fake `media_jobs` rows. They receive `media_references.kind = comfy_artifact` mappings to their Comfy Prompt IDs.

Jobs and Downloads therefore converge on the same operator identity:

```text
/jb 52
/dl i 52
/dl g 52
```

Legacy Helix IDs and legacy Comfy Prompt-prefix input remain compatibility paths where supported.

## Telegram checkpoint

Telegram remains a bounded operator/generation surface, not a shell or general control plane.

Private operator capabilities include diagnostics, queue/job/download inspection, failures/events/outbox, guarded cancellation, T2V/T2I generation, settings, and explicit developer controls.

The repository contains forum-topic routing for the `Absolute Cinema` generation forum:

```text
Image topic -> image.t2i
Video topic -> video.t2v
```

Forum interaction is isolated by `(chatId, threadId, userId)` and uses **no ForceReply behavior**. A bare `/t2i` or `/t2v` creates scoped `awaiting_prompt` state and sends an ordinary prompt card; the next plain-text message from that exact chat/topic/user is accepted while the state remains active. The user does not need to reply to the card. Prompt cards are removed after successful capture and are also cleaned up when a new slash command abandons the pending prompt where possible. Confirmation uses inline Generate/Cancel or Reset/Cancel buttons. Operator-only commands and T2V developer controls remain private-chat-only.

Repository commits `d81e78f` and `02c2aa1` contain the current scoped prompt-capture and callback-keyboard fixes. After rebasing onto the documentation cleanup, the media-runtime validation suite passed **57/57** tests.

### Lifecycle/progress deployment status

**Verified live on the VPS on 2026-09-01.**

The production PostgreSQL schema contains the effects of `0014_telegram_job_lifecycle.sql`:

```text
telegram_job_lifecycles
operator_pending_t2i.confirmation_message_id
operator_pending_t2v.confirmation_message_id
```

The inspected running `helix-runtime:dev` container also contains the compiled lifecycle/progress implementation, including:

```text
/app/dist/telegram/progress-service.js
/app/dist/delivery/telegram.js
/app/dist/repositories/telegram-job-lifecycle-repository.js
/app/dist/adapters/comfy/events.js
```

This verifies that both the lifecycle migration and lifecycle/progress runtime code are deployed. The implementation includes persistent Comfy execution WebSocket telemetry with a stable Helix client identity, normalized execution/progress events, compact Workflow + Sampling presentation, durable lifecycle-message ownership, primary artifact replacement through `editMessageMedia`, and retry/failure presentation on the same lifecycle target.

The scoped-prompt-capture and callback-keyboard fixes were pushed to repository `main` after that container inspection. Because the inspected container had already been running for several days, deployment of those **latest interaction fixes** is not yet proven by the existing container checkpoint.

A successful recent end-to-end lifecycle smoke was also **not** established by the verification output. The sampled runtime logs contained a Telegram command-poll `TypeError: fetch failed`, so Telegram transport health and a fresh forum/lifecycle smoke remain separate verification tasks.

See:

- `docs/TELEGRAM_DESIGN.md`
- `docs/TELEGRAM_FORUM_IMPLEMENTATION_PLAN.md`
- `docs/TELEGRAM_LIFECYCLE_PROGRESS_IMPLEMENTATION.md`

## T2V Production checkpoint

Christopher Nolan owns the validated native LTX 2.5 `video.t2v` path.

Persisted semantic settings include:

```text
Core
asp   Aspect
qual  Quality
time  Duration
enh   Prompt Enhance

Advanced (-dev)
fps    FPS
seed   Stage 1 seed
seed2  Stage 2 seed
neg    Negative prompt
mp     Megapixel override
samp   Sampler
cfg    Guidance
```

Current baseline:

```text
Aspect       16:9
Quality      Standard / 0.9 MP
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

Generation modes are:

```text
Manual
Fast
Quality
```

Mode overlays never rewrite stored manual settings.

Prompt Enhance has already been evaluated. For already-directed Helix Production prompts it should generally remain **OFF**; useful enhancement principles belong in Helix-side prompt compilation rather than a competing automatic director.

Prompt Relay has also been validated. Its useful abstraction is:

```text
temporal semantic routing / scene progression
```

not hard timestamps, physics control, or persistent object-state tracking.

## T2I Production checkpoint

Annie Leibovitz owns the narrow `image.t2i` path.

The current runtime wiring targets **FLUX.2 Klein 4B INT8 W8A8** as the active workflow candidate. The prior Distilled FP8 workflow remains installed as a rollback path and was itself validated earlier.

V1 deliberately exposes only:

```text
prompt
aspect
seed
```

The workflow binder mutates only vetted prompt, width, height, and seed inputs. Model switching and T2I generation modes remain deferred.

## Upscaling / restoration research checkpoint

Upscaling is an active Production research track but is **not** a Production capability yet.

Candidate logical identity:

```text
lowry / John D. Lowry
```

No `image.upscale` or `video.upscale` tool has been added to the runtime.

### SeedVR2 video result

The worker experimentally contains `numz/ComfyUI-SeedVR2_VideoUpscaler` pinned at `v2.5.23` / commit `5a4bf428f3735cc72ac760d40f372f94dec28422`, with 7B regular/Sharp FP16 research models.

A full ~8 second 704x1280 LTX clip completed with 7B regular FP16 in about **128 minutes**. A one-second 24-frame 7B Sharp test took about **12.5 minutes**. Sharp was visually best against regular/Lanczos, but the gain was modest.

Decision:

```text
clean generated LTX video
-> do not default to SeedVR2

truly degraded / low-resolution video
-> SeedVR2 remains an unclosed restoration candidate
```

Video upscale integration is halted for now.

### SeedVR2 image result

A clean 1024x1024 FLUX portrait was tested with Lanczos and SeedVR2 7B Sharp at 2x. SeedVR2 took roughly 68 seconds and produced only subtle improvements. A known-ground-truth 1024 -> 512 -> 1024 restoration test was likewise not decisive enough to select SeedVR2 as the final image path.

The main lesson is that faithful enlargement, restoration, and generative enhancement are different jobs.

### Revised image direction — 2026-09-03

Community/workflow research showed that the desired visible improvement on already-good AI images is closer to **controlled generative refinement** than conservative super-resolution.

Helix already has a working FLUX.2 Klein 4B INT8 W8A8 stack, so the immediate next experiment reuses it rather than installing another model family.

The benchmark uses a source image as both reference latent and starting latent, with a fixed Klein prompt/sampler and denoise sweep. The first test stays at 1024x1024 to measure the fidelity-versus-detail curve before testing physical 2x/4x enlargement or tiled 4K generation.

Research docs:

- `production/upscaling/README.md`
- `production/upscaling/KLEIN4B_ENHANCEMENT_TEST.md`

PiSA-SR, VOSR, TVT and other independent SR architectures remain comparison candidates if the existing Klein 4B enhancement ceiling is insufficient.

Do not add Lowry to `config.ts` or expose upscale tools until this benchmark closes.

## LTX Production research checkpoint

Native LTX 2.5 remains the first Production choice for focused shots inside its proven comfort zone.

Controlled work has established:

- native 5 s / 8 s / 10 s T2V behavior;
- meaningful temporal allocation and camera/action planning;
- native hard cuts and joint audiovisual generation;
- Prompt Relay scene-progression value;
- full-resolution native I2V as an identity/detail candidate;
- CGlide and Lightricks long-video continuation baselines;
- tool-specific controls must stay inside Production rather than becoming Helix Director concepts.

Exact multi-object physical state, strict collision geometry, fragile possession chains, and guaranteed final-state completion remain weaker classes.

## Reference-conditioning checkpoint

Reference conditioning is no longer a purely future capability.

### Licon MSR

A first one-subject LTX 2.5 MSR generation passed locally: the reference person's recognizable identity/appearance survived while composition changed substantially into a new scene.

Still pending:

- stronger viewpoint identity testing;
- multi-subject slot separation;
- person + product + background interaction;
- combined timing/reference behavior.

### Lightricks Ingredients

Lightricks Ingredients Core IC-LoRA has also produced a real local new-scene reconstruction on the LTX 2.3 stack using person + product + location references. The cheap 8-step path proved the mechanism, not the final quality ceiling.

Still pending:

- higher-quality 30-step / CFG / STG validation;
- controlled comparison against Licon on matched reference tasks.

The responsibility split remains:

```text
Prompt Relay
-> WHEN semantic beats should dominate

reference conditioning
-> WHO / WHAT should remain visually consistent
```

Do not collapse these into one control concept.

See `production/ltx-director/README.md` and its linked research notes.

## Speech checkpoint

`services/speech/` contains the project-owned local speech foundation.

Moonshine Voice `0.1.5` with the Medium Streaming English model is validated on the VPS CPU through the project-owned transcription harness. The production installation lives outside the repository at `/opt/helix-speech`.

There is **no production speech daemon, HTTP endpoint, or Telegram voice-note integration yet**. Future voice input should transcribe to text and then enter the existing media-runtime command/pending-state paths rather than creating a second command interpreter.

## Tiny-LLM checkpoint

`research/helix-ai-adapter/` remains detached research. Qwen3 0.6B Q8_0 and related benchmark cases are being evaluated for bounded semantic tasks, but no tiny model is integrated into Telegram, the database, workflow mutation, or job execution.

## Production workflow policy

Production should expose Helix semantics, not raw Comfy node IDs.

```text
creative / generation intent
        ↓
semantic Production settings
        ↓
optional tool-specific controls
        ↓
workflow binder / adapter
        ↓
ComfyUI
```

Prompt Relay, LTX Director, MSR, Ingredients, upscale models, enhancement denoise, samplers, node IDs, and model-specific graph state remain Production implementation details unless repeated experiments prove that a higher-level concept belongs in a stable cross-system contract.

## Reliability work still outstanding

- durable recovery for the submission window before `backend_job_id` is persisted;
- atomic API idempotency under concurrent duplicate requests;
- Helix-owned timeout semantics when backend cancellation/status is unavailable;
- service authentication before expanding runtime network trust;
- CI/integration-test enforcement;
- formal migration ledger/checksum governance;
- explicit at-least-once Telegram delivery semantics;
- real Windows reboot / AtStartup validation;
- worker output-retention cleanup;
- image upload/staging for broader I2V flows;
- rebuild/restart the runtime with the latest scoped prompt-capture interaction fixes, investigate the observed Telegram command-poll `fetch failed` transport error, and complete a live lifecycle/forum smoke test.

These are hardening tasks, not reasons to rewrite the current Production boundary.

## Preparation checklist

- [ ] Keep sanitized n8n exports as workflows stabilize.
- [ ] Define common IDs and object names across system divisions.
- [ ] Define executable/versioned shared contracts for Intelligence/Director/Experiment/Production objects.
- [ ] Define evidence/provenance requirements for Intelligence research.
- [x] Establish durable Production state outside n8n.
- [x] Validate native LTX 2.5 I2V/T2V generation.
- [x] Pin the standalone ComfyUI/custom-node execution stack.
- [x] Submit, track, reconcile and deliver real generation through `helix-runtime`.
- [x] Add Telegram diagnostics/queue/job/outbox/error/event views.
- [x] Add durable operational alerts and safe cancellation.
- [x] Add durable T2V/T2I pre-submit confirmation.
- [x] Implement Core/Advanced T2V settings.
- [x] Implement Manual/Fast/Quality generation modes.
- [x] Add profile-aware Annie Leibovitz T2I generation.
- [x] Add one shared numeric media-reference namespace for Helix and direct Comfy artifacts.
- [x] Add 20-item Jobs and Downloads pagination.
- [x] Evaluate Prompt Enhance.
- [x] Validate Prompt Relay for temporal semantic routing.
- [x] Validate first one-subject Licon MSR generation.
- [x] Validate Ingredients Core IC-LoRA multi-asset reconstruction mechanism.
- [x] Verify live `0014` Telegram lifecycle migration and lifecycle/progress runtime code.
- [x] Replace forum ForceReply behavior with scoped next-message prompt capture in repository code.
- [x] Pass post-rebase media-runtime regression suite (`57/57`).
- [x] Record SeedVR2 video/image upscale research and halt default clean-video integration.
- [ ] Benchmark FLUX.2 Klein 4B controlled image enhancement before choosing a Lowry image path.
- [ ] Deploy/restart latest scoped prompt-capture fixes and complete a live Telegram lifecycle/forum smoke.
- [ ] Validate stronger MSR viewpoint/identity retention.
- [ ] Validate multi-subject MSR separation.
- [ ] Validate higher-quality Ingredients settings.
- [ ] Validate/calibrate Fast and Quality modes with controlled benchmarks.
- [ ] Validate real Windows reboot/AtStartup behavior.
- [ ] Close Production reliability items from the repository audit.

## Next Helix brain phase

**Niche Intelligence design** remains the next main brain phase.

The intended research direction is platform-first rather than generic-web-search-first. YouTube/Facebook/Reels-style observations should provide primary behavioral evidence; wider web research should supplement those observations.

Niche Intelligence should eventually define concepts such as:

```text
Niche
EvidenceRef
observed content features
trend / saturation / novelty signals
observed facts vs inferred patterns
NicheModel
```

Later Helix Director logic should consume that model without knowing whether Production currently uses LTX, FLUX, another local model, a provider API, stock footage, motion graphics, or human editing.
