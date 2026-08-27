# Helix

Helix is a planned high-throughput short-form content intelligence, directing, experimentation, production, distribution, and feedback system for YouTube Shorts, Instagram Reels, and similar platforms.

The project is intentionally divided so that the **brain of the system is independent from generation technology**. Video/image/audio generation is a replaceable Production concern, not the core decision-maker.

## Current status

**Preparation / foundation phase, with the first Production execution slice locked as a stable checkpoint, a controlled native LTX 2.5 T2V quality baseline established, and a persisted T2V settings/reset surface now implemented.**

The active brain-development path is:

```text
Niche Intelligence
      ↓
Director
      ↓
Experiment Engine
```

Production/generation continues as a separate workstream and will connect through stable briefs/contracts rather than shaping the Intelligence or Director architecture.

The current Production checkpoint includes a durable ComfyUI execution runtime, PostgreSQL job/delivery state, sequential numeric Job references, 20-item paginated Jobs and live Downloads views, original-file Telegram delivery, operator diagnostics, durable operational alerts, complete job-event debugging, guarded terminal-style job cancellation, and a validated Telegram generation path for native LTX 2.5 T2V and an active FLUX.2 Klein 4B INT8 W8A8 T2I candidate with pre-submit confirmation.

T2V is no longer prompt-only. `Christopher Nolan / video.t2v` has a persisted semantic settings layer with Core controls for aspect, quality, duration and prompt enhancement, plus explicit `-dev` access to FPS, Stage 1/2 seeds, negative prompt, megapixel override, sampler and guidance. Durable reset confirmation can restore Core defaults or the full exposed T2V baseline.

Native LTX 2.5 T2V has been benchmarked across controlled 5-second, 8-second and 10-second runs before adding Director/Prompt Relay controls. The current research result is to use focused native LTX first for shots inside its proven comfort zone and escalate to stronger Production controls only when timing, shot responsibility, state changes, or structured progression repeatedly fail.

The current Production mode layer is intentionally small: `manual`, `fast`, and `quality`. A mode overlays only proven execution settings and never rewrites the stored manual settings. There is no `auto` mode. Annie Leibovitz `image.t2i` intentionally has no modes; its narrow V1 settings are aspect and seed.

The current generation research direction is **open/self-hosted first**. Runway is not part of the active Production plan. Seedance 2.0 is being used as a behavioral/quality reference rather than an active dependency.

See [`production/README.md`](production/README.md), [`production/ltx-director/NATIVE_T2V.md`](production/ltx-director/NATIVE_T2V.md), and [`production/media-runtime/README.md`](production/media-runtime/README.md).

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
- `infra/`, `services/` — implementation support once real boundaries require them

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

No Director component should depend on a specific model or production provider. The current open/self-hosted Production direction is an execution choice, not a Helix brain dependency.

Anything not recorded as a decision remains a working assumption until validated.
