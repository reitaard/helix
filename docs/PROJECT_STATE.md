# Project State

## Current phase

**Preparation / foundation, with a validated Production execution slice and a read-only operator surface.**

The high-level Helix system division is established. The project is still avoiding a premature full-system implementation, but the Production-side ComfyUI execution path has now been hardened enough to serve as a stable checkpoint while workflow research and system polish continue independently.

## Primary system direction

The main post-preparation Helix brain remains:

```text
Niche Intelligence -> Director -> Experiment Engine
```

Production/generation remains a separate workstream connected through stable creative/variant briefs rather than being allowed to shape Intelligence or Helix Director architecture.

## Current project divisions

- Foundation / Preparation
- Intelligence
- Director
- Experiment Engine
- Production
- Distribution
- Analytics / Feedback

## Existing implementation knowledge to preserve

- n8n orchestration experience;
- asynchronous generation pattern: create task -> task id -> status/result -> output;
- Runway workflow concepts and task-monitor behavior;
- Reitaard as a future application shell/interface;
- provider/model/workflow research as provisional Production input;
- local LTX 2.5 / ComfyUI production research, including reproducible generation manifests and controlled prompt/seed/workflow testing;
- LTX Director research: timed prompts, keyframes, Prompt Relay, CGlide continuation, Lightricks temporal tiling, audio, retake and long-video controls as candidate Production control surfaces, not Helix Director dependencies;
- a pattern where Helix-owned execution intent is compiled into backend-specific workflows instead of agents manipulating provider UIs directly;
- a durable self-hosted Production runtime boundary: caller/n8n -> `helix-runtime` -> PostgreSQL -> ComfyUI worker -> artifact delivery;
- a read-only Telegram operator surface inside the runtime for diagnostics, queue state, durable job inspection, and post-generation outbox visibility without giving Telegram unrestricted write control over the worker.

## Active Production-side checkpoint

Current status as of 2026-08-23:

```text
caller / n8n
    ↓
helix-runtime :8787
    ├── helix-db
    ├── TelegramCommandService
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

The dedicated RTX 4060 ComfyUI worker is pinned and operational.

Current identity/runtime facts:

```text
durable worker ID: helix-rtx4060-01
display name: Christopher Nolan
ComfyUI: 0.33.0
Comfy revision: 7dde56176efa71fd74ef7b3930ab5882d1926288
Python: 3.12.11
PyTorch: 2.10.0+cu130
```

The VPS-side runtime now supports:

- durable media job acceptance and PostgreSQL state;
- raw Comfy API-workflow submission through `POST /prompt`;
- Comfy `prompt_id` persistence as the backend job ID;
- queue/history reconciliation and restart recovery;
- live `queued -> running -> succeeded` tracking;
- artifact discovery and retrieval through Comfy `/view`;
- ffprobe media metadata inspection;
- durable Telegram original-file delivery with metadata in the same document caption;
- delivery retry/backoff, stale-claim recovery and terminal retry limits;
- delivery state exposed through `GET /v1/media/jobs/:jobId`;
- prompt-specific media-job cancellation;
- race-safe terminal job transitions;
- configurable running-job timeout;
- immediate VPS spool cleanup after each delivery attempt;
- human-friendly worker naming without changing durable IDs;
- live Comfy/Python/Torch/GPU/VRAM/RAM diagnostics;
- direct lightweight Comfy queue summaries;
- read-only Telegram `/status`, `/queue`, `/jobs`, `/job`, `/outbox`, `/help` commands;
- full durable IDs in `/jobs` for direct copying;
- unique-prefix `/job` lookup with copied trailing-dot cleanup;
- read-only outbox summary for pending/sending/retrying/terminal-failed deliveries;
- hidden `/st`, `/stat`, `/qu`, `/que`, `/jbs`, `/jb`, `/ob`, `/h` aliases without advertising them;
- read-only pinned-Comfy-revision comparison against upstream `master` with a 15-minute cache;
- Telegram command registration cleared on startup so the bot does not force a Menu button.

The Telegram command service accepts messages only from the configured chat ID and remains deliberately read-only. It does not expose restart, shell, package update, or arbitrary worker mutation actions.

The Outbox view is presentation-only. `OutboxRepository` reads durable `media_deliveries` state but does not claim, retry, reset, or mutate deliveries. `DeliveryWorker` remains responsible for delivery execution.

The update indicator is informational only. It reports whether official ComfyUI `master` has commits beyond the configured production pin; it does not automatically update the worker and should not be interpreted as a stable-release guarantee.

Two runtime-controlled LTX 2.5 I2V generations have been proven, including the C6 hybrid run:

```text
Helix job:    job_e2a4a9efff7a47b8b70cd41c068073ac
Comfy prompt: cc8e51f4-1799-4600-8ff0-6226c2e291e4
Result:       succeeded
Artifact:     video/LTX-2.5_i2v_00005_.mp4
```

The C6 artifact was also delivered through the durable Telegram path in one attempt, with delivery state persisted separately from generation state.

## Telegram operator checkpoint

The current read-only command surface is:

```text
/status      diagnostics
/queue       current Comfy + Helix queue state
/jobs        five most recent jobs with full durable IDs
/job <id>    one job plus its Outbox/send state
/outbox      only send work still needing attention
/help        command list
```

`/outbox` excludes already-delivered rows. Its presentation maps internal delivery states as follows:

```text
pending                         -> pending
delivering                      -> sending
failed + next_attempt_at set    -> retrying
failed + next_attempt_at null   -> failed
```

The command shows at most five attention items, prioritizes terminal failures, and reports retry timing or compact terminal error text where useful. This keeps the operator surface actionable rather than turning it into another history list.

Write-capable Telegram actions remain deferred. A future `/cancel <id>` can be considered separately after the read-only job/outbox layer is proven in normal use.

## Production workflow policy

The runtime is intentionally not being expanded into a large semantic workflow API yet.

Current policy:

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

Deferred while workflow controls are still moving:

- actual image upload/staging through `/upload/image`;
- broad prompt/chunk-prompt bindings;
- Prompt Relay semantic bindings;
- sampler/Director semantic bindings;
- T2V semantic bindings;
- persistent WebSocket execution tracking;
- worker output-retention deletion infrastructure;
- write-capable Telegram operator actions.

Worker retention is deferred because the traditional Comfy output path does not currently provide the runtime with a clean per-artifact delete primitive. Adding a separate worker-side deletion service only for cleanup is not justified at this checkpoint.

## Current Production direction

The immediate session-level focus may remain lightweight runtime/operator polish rather than generation workflow work. This does not change the longer Production sequence:

1. keep the runtime and operator surface small and reliable;
2. continue I2V quality/continuity optimization when returning to workflow work;
3. establish a simple native LTX 2.5 T2V baseline;
4. test only controls that materially improve output or continuity;
5. discover which prompt, temporal, sampler and Director controls actually deserve a stable interface;
6. keep raw API-format graphs usable through Helix during experimentation;
7. freeze/version I2V and T2V workflow families only after they stabilize.

The existing LTX Director/CGlide/Lightricks findings remain valuable Production research, but they are not a reason to destabilize the current runtime checkpoint. See `production/ltx-director/` for detailed experiment history.

One operational validation remains pending: the Windows scheduled task has been started successfully by hand, but a real reboot -> automatic ComfyUI worker startup has not yet been proven.

## Preparation checklist

- [ ] Keep sanitized n8n exports as workflows stabilize.
- [ ] Define common IDs and object names across system divisions.
- [ ] Define draft contracts for `Niche`, `ResearchFinding`, `NicheModel`, `ContentIdea`, `ContentSpec`, `Experiment`, `Variant`, `MediaAsset`, `PublishedPost`, and `PerformanceSnapshot`.
- [ ] Define evidence/provenance requirements for Intelligence research.
- [x] Establish durable Production state outside n8n for the active ComfyUI execution path.
- [ ] Keep real credentials outside git and document configuration names only when introduced.
- [ ] Document Reitaard <-> Helix boundaries when backend contracts become clearer.
- [x] Preserve provider-neutral generation job knowledge inside Production without making it a blocker for Intelligence work.
- [ ] When Production workflow families stabilize, validate whether an internal `ProductionPlan` boundary is useful before promoting it to a shared schema.
- [x] Validate native LTX 2.5 I2V generation on the standalone worker.
- [x] Validate Prompt Relay as a Production temporal-control mechanism.
- [x] Validate CGlide chunk continuation and handoff behavior.
- [x] Validate Lightricks LoopingSampler temporal extension.
- [x] Pin the standalone ComfyUI/custom-node execution stack.
- [x] Submit, track, recover and deliver a real generation through `helix-runtime`.
- [x] Add read-only Telegram system status and queue visibility.
- [x] Add Telegram recent-job and unique-prefix job inspection.
- [x] Add read-only Telegram Outbox/send-state visibility.
- [x] Add live worker RAM/VRAM diagnostics and read-only Comfy upstream-drift awareness.
- [ ] Validate a simple T2V workflow before defining T2V semantic bindings.
- [ ] Validate real Windows reboot/AtStartup behavior for the ComfyUI worker.

## Next Helix brain phase

**Niche Intelligence design.**

The next brain-design work should answer:

1. What exactly is a niche in Helix?
2. What sources and observations enter the Intelligence system?
3. What features should be extracted from content/examples?
4. How do we represent hooks, formats, topics, pacing, visuals, narrative structure, audience, saturation, novelty and temporal trends?
5. How do we distinguish observed facts from inferred patterns?
6. What does a `NicheModel` contain?
7. How does the Director query and consume it?

## Later

After the Intelligence contract is coherent:

1. Director skill design;
2. Experiment Engine algorithms;
3. connect the stable Production execution/workflow boundary;
4. Distribution;
5. closed-loop Analytics/Feedback.
