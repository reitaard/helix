# Helix

Helix is a planned high-throughput short-form content intelligence, directing, experimentation, production, distribution, and feedback system for YouTube Shorts, Instagram Reels, and similar platforms.

The project is intentionally divided so that the **brain of the system is independent from generation technology**. Video/image/audio generation is a replaceable Production concern, not the core decision-maker.

## Current status

Helix remains in the **Preparation / foundation phase**, with a comparatively mature single-worker Production execution slice and several active research tracks.

The active brain-development path remains:

```text
Niche Intelligence
      ↓
Director
      ↓
Experiment Engine
```

Production/generation continues as a separate workstream and connects through stable semantic contracts rather than shaping Intelligence or Director around ComfyUI/LTX details.

Current Production facts:

- one physical RTX 4060 worker: `helix-rtx4060-01`;
- one VPS `helix-runtime` and PostgreSQL state store;
- durable asynchronous ComfyUI job submission, reconciliation, cancellation, timeout, artifact capture, and delivery;
- one durable numeric media-reference namespace shared by Helix jobs and direct ComfyUI artifacts;
- logical Production Profiles `nolan` / Christopher Nolan for video and `leibovitz` / Annie Leibovitz for image generation;
- validated native LTX 2.5 T2V plus persisted semantic T2V settings and Manual/Fast/Quality modes;
- active FLUX.2 Klein 4B INT8 W8A8 T2I workflow candidate, with the prior Distilled FP8 path retained for rollback;
- Telegram private-operator controls plus forum-topic Image/Video generation routing;
- Telegram lifecycle/progress schema and runtime code are deployed: migration `0014_telegram_job_lifecycle.sql` is present in the live PostgreSQL schema and the running `helix-runtime` image contains lifecycle/progress, `editMessageMedia`, and persistent Comfy event handling code.

The current generation direction is **open/self-hosted first**. Runway is not part of the active Production plan. Seedance-class systems remain behavioral/quality references where useful.

## Production research checkpoint

Native LTX 2.5 remains the first-choice path for focused shots inside its proven comfort zone. Controlled work has validated meaningful temporal allocation, camera/action planning, hard cuts, joint audiovisual generation, and useful Prompt Relay scene progression.

Reference-conditioning research has moved beyond theory:

- Licon MSR has produced a locally validated one-subject new-scene identity/appearance result on LTX 2.5;
- Lightricks Ingredients Core IC-LoRA has reconstructed a new person + product + location scene locally on the LTX 2.3 stack;
- stronger viewpoint retention, multi-subject separation, higher-quality Ingredients settings, and combined reference/timing controls remain research tasks.

See [`production/ltx-director/README.md`](production/ltx-director/README.md) for the current detailed Production research state.

## Other validated research

- [`services/speech/`](services/speech/) contains the project-owned Moonshine validation harness. Moonshine Medium Streaming English is validated locally on the VPS CPU; Telegram voice integration is not implemented yet.
- [`research/helix-ai-adapter/`](research/helix-ai-adapter/) is detached tiny-LLM research for bounded semantic tasks. It is not integrated into Telegram, media-runtime, or job execution.

## System divisions

- `intelligence/` — niche research, source discovery, ingestion, feature extraction, trend/format understanding, niche models
- `director/` — concept, hook, narrative, visual/audio direction, pacing, and critique
- `experiments/` — hypothesis design, controlled variants, scoring, selection, mutation, and lineage
- `production/` — generation/editing execution; model/provider choices live here and remain replaceable
- `distribution/` — publishing/scheduling/account/platform adapters when implemented
- `analytics/` — performance snapshots and feedback inputs
- `shared/schemas/` — cross-system contracts and identifiers
- `workflows/` — sanitized n8n workflow exports and orchestration notes
- `research/` — evidence and validation notes; research is input to decisions, not automatically truth
- `docs/` — system boundaries, preparation, state, assumptions, and decisions
- `infra/`, `services/` — implementation support for proven boundaries

## Core principle

```text
Intelligence tells us what is happening.
Director decides what should be made.
Experiment Engine decides what should be tested.
Production decides how to manufacture it.
Distribution publishes it.
Analytics measures what happened.
Feedback improves the next cycle.
```

No Helix Director component should depend on a specific model or production provider. Anything not recorded as a decision remains a working assumption until validated.

For the canonical checkpoint, read [`docs/PROJECT_STATE.md`](docs/PROJECT_STATE.md).
