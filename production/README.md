# Production

Production is the execution layer. This area contains the active ComfyUI worker/runtime work as well as model/workflow experiments.

The current generation direction is **open/self-hosted first**. Runway is not part of the active Production plan. Seedance 2.0 is used as a behavioral/quality reference rather than as an integrated provider.

## Current execution path

```text
n8n / caller / Telegram
    ↓
helix-runtime
    ├── helix-db + worker/job/delivery/operator state
    ├── TelegramCommandService
    ├── TelegramAlertService
    ├── TelegramCancelService
    ├── TelegramT2VService
    ├── TelegramT2VSettingsService
    ├── TelegramT2VModeService
    ├── TelegramT2VResetService
    └── OutboxRepository
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
Telegram original-file delivery
```

The worker/runtime boundary is a stable checkpoint. It supports durable job acceptance, raw Comfy workflow submission, `prompt_id` persistence, queue/history reconciliation, restart recovery, artifact capture/retrieval, cancellation, running-job timeout, durable Telegram delivery, bounded retry, diagnostics, operator inspection, proactive alerts, confirmed T2V submission, persisted T2V settings, durable reset confirmation, and generation modes.

See [`production/comfyui-worker/`](comfyui-worker/) for the worker state and roadmap.

See [`production/media-runtime/`](media-runtime/) for the deployed TypeScript runtime implementation.

## Current ComfyUI/LTX validation

The standalone RTX 4060 worker has validated native LTX 2.5 I2V and T2V generation and exposes the pinned ComfyUI/custom-node stack only through the private Tailscale path.

```text
durable worker ID: helix-rtx4060-01
display name: Christopher Nolan
validated tools: video.i2v, video.t2v
```

LTX/Director workflow experiments remain execution research, not a frozen Helix contract. See [`production/ltx-director/`](ltx-director/) for experiment notes.

## Native T2V research checkpoint

Controlled native runs cover:

```text
5 s  -> 121 frames @ 24 fps
8 s  -> 193 frames @ 24 fps
10 s -> 241 frames @ 24 fps
1280x704 output on the current 16:9 / 0.9 MP two-stage path
Prompt Enhance OFF for the native baseline
```

Current findings:

- native LTX already provides meaningful temporal allocation, camera/action planning, native hard cuts and joint AV behavior;
- focused continuous shots should try native LTX first;
- 5 seconds is the exact tested default baseline and remains useful for compact/high-motion ideas;
- 8 seconds is the strongest current general-purpose duration for richer single shots;
- 10 seconds should be used only when the scene genuinely has enough evolving action;
- exact collision geometry, dense physical causality, precise reflection geometry and strict multi-action tracking remain weak;
- longer duration can stretch a story instead of completing more events;
- natural overlapping action language generally works better than rigid state-machine phrasing;
- benchmark adherence and finished-video quality must be evaluated separately;
- dominant sound sources are more reliable than subtle ambient beds.

See [`production/ltx-director/NATIVE_T2V.md`](ltx-director/NATIVE_T2V.md) for the full findings.

## T2V semantic settings

`Christopher Nolan / video.t2v` has persisted base settings.

Core:

```text
asp   Aspect
qual  Quality
time  Duration
enh   Prompt Enhance
```

Advanced settings require explicit `-dev` authority:

```text
fps    FPS
seed   Stage 1 seed
seed2  Stage 2 seed
neg    Negative prompt
mp     Megapixel override
samp   Sampler
cfg    Guidance
```

Exact default/test baseline:

```text
Aspect       16:9
Quality      Standard -> 0.9 MP
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

The workflow binder maps these semantic controls into the vetted T2V graph. Model files, sigmas, decoder tiling, bit depth and other graph plumbing remain outside the operator settings contract.

## Generation modes

The operator concept is **Mode**, not Profile.

Christopher Nolan remains the Production profile/authority. `manual`, `fast`, and `quality` are generation modes applied above the stored T2V settings.

```text
stored manual settings
        ↓
selected mode overlay
        ↓
effective settings snapshot
        ↓
workflow binder
        ↓
ComfyUI
```

Modes do **not** rewrite the stored manual settings. Switching back to `manual` exposes the operator's original settings unchanged.

Current v1 mode policy:

```text
manual
  no overlay

fast
  Quality   Standard / 0.9 MP
  Duration  5 s
  FPS       24
  MP        quality-derived

quality
  Quality   High / 1.2 MP
  Duration  8 s
  FPS       24
  MP        quality-derived
```

Aspect, seeds, negative prompt, sampler, guidance and prompt-enhance state remain inherited from the stored manual settings unless a future calibrated mode explicitly earns ownership of one of those controls.

There is no `auto` mode.

Telegram surface:

```text
/t2v mode
/t2v m
/t2v mode manual
/t2v mode fast
/t2v mode quality
/t2v mode reset   -> manual
```

The generation confirmation shows the selected mode and the effective settings that will actually be submitted.

Migration `0009_t2v_generation_modes.sql` persists the selected mode.

## Reset semantics

```text
/t2v reset
→ reset Core base settings only

/t2v reset -dev
→ reset all exposed base settings

/t2v mode reset
→ select Manual mode
```

Settings reset and mode selection are intentionally separate. Resetting settings does not silently change the selected mode, and selecting a mode does not mutate stored settings.

## Workflow integration policy

The runtime must not become a raw mirror of the Comfy graph.

```text
vetted Comfy API workflow
        ↓
stored semantic settings
        ↓
optional generation mode overlay
        ↓
effective settings snapshot
        ↓
workflow binder
        ↓
helix-runtime execution
```

Native LTX should be the first Production path for shots inside its proven comfort zone. Director/Prompt Relay should be introduced only when required beats, state changes, shot responsibilities, or timing relationships repeatedly fail under focused native prompting.

## Telegram operational checkpoint

The operator surface includes:

```text
/status      Diagnostics
/queue       Queue check
/jobs        Recent jobs
/job <id>    Job details
/outbox      Send queue
/errors      Recent failures
/events <id> Job events
/t2v         Generate video
/cancel <id> Cancel job
```

T2V subcommands now include settings, reset, and mode inspection/mutation.

`/t2v` separates prompt entry from GPU execution:

```text
/t2v
  ↓
awaiting prompt
  ↓
prompt preview + effective settings snapshot
  ↓
yes / no
  ↓ yes
video.t2v JobService submission
```

No media job is created until confirmation. The settings snapshot freezes the effective generation configuration so later mode or settings changes cannot alter an already-previewed generation.

## Current checkpoint

Completed:

- durable asynchronous submission and restart recovery;
- artifact capture/retrieval and original-file Telegram delivery;
- cancellation and running timeout;
- diagnostics, alerts and complete event inspection;
- durable cancellation confirmation;
- durable T2V prompt/confirmation state;
- validated native `video.t2v` generation;
- controlled 5/8/10-second native T2V research baseline;
- persisted Core/Advanced T2V settings;
- durable Core/full T2V reset;
- persisted generation modes: Manual, Fast, Quality;
- mode overlays that preserve stored manual settings;
- effective settings snapshot at generation confirmation.

Still deferred:

- worker output-retention cleanup;
- actual image upload/staging;
- Prompt Enhance ON/OFF calibration;
- targeted Director/Prompt Relay retesting;
- broader prompt/relay semantic bindings;
- persistent WebSocket execution tracking;
- broader Telegram mutation commands.

A real Windows reboot -> automatic ComfyUI worker startup remains to be proven.

## Next Production phases

1. **Mode validation** — benchmark Fast vs Quality vs Manual with fixed prompts/seeds and native artifacts; compare runtime, motion/coherence, adherence, action completion and AV quality.
2. **Mode calibration** — change only values that repeated tests justify; keep mode definitions versionable and small.
3. **Prompt Enhance A/B** — controlled preprocessing comparison with raw prompt/settings retained.
4. **Targeted Director / Prompt Relay** — apply stronger control only to native failure classes that still matter.
5. **Production contract freeze** — freeze/version the stable workflow family and expose one semantic contract to Telegram, n8n and later Helix Director callers.

There is intentionally no Auto phase. Mode selection stays explicit until a future system requirement proves otherwise.
