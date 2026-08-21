# Production

Production is the execution layer. It is intentionally separate from Intelligence, Director, and Experiment Engine.

## Purpose

Turn an approved `ContentSpec` / `VariantPlan` into media while preserving production metadata and lineage.

## Internal control boundary

Production will likely need its own machine-readable execution plan before any provider/model adapter is called:

```text
ContentSpec + VariantPlan
        ↓
Production planning
        ↓
ProductionPlan (provisional internal name)
        ↓
Backend adapter
        ↓
MediaAsset
```

A ProductionPlan may eventually contain shot timing, keyframes, references, motion/audio guidance, quality targets, retry/QC policy, and backend requirements. It is not a shared schema yet and must not expose one provider's workflow format upstream.

## Current LTX / ComfyUI research

LTX 2.5 and WhatDreamsCost LTX Director are current Production research inputs, not permanent Helix dependencies.

Useful findings:

- native LTX I2V and timeline-directed generation can remain separate production routes;
- LTX Director exposes timed prompt segments, image/keyframe guidance, IC-LoRA motion/reference guidance, audio tracks, video input/extension concepts, and retake regions;
- much of the Director state is machine-readable (`timeline_data`, local prompts, segment lengths, guide strengths, motion/audio segments), so agents should compile structured state rather than automate the visual canvas;
- ComfyUI can remain the execution worker behind a backend adapter while Helix owns the higher-level plan and lineage;
- human timeline edits should be treated as review/override input, not as a requirement for every generation.

### Current local vertical slice

The workstation now loads WhatDreamsCost `LTX Director` and `LTX Director Guide` successfully. A D0 integration has been built around the existing native LTX 2.5 two-stage backend using the upstream Director topology:

```text
Director
  -> Guide 0.5 / Stage 1
  -> Crop Guides
  -> x2 latent upscale
  -> Guide 1.0 / Stage 2
  -> decode
```

The Director nodes are placed inside the existing `Image to Video (LTX-2.5)` subgraph because that template hides the actual model/sampler execution graph there. This is a ComfyUI adapter implementation detail, not a Helix-wide architectural rule.

Runtime generation is still pending. The known-good native LTX 2.5 workflow remains preserved as the control.

See [`production/ltx-director/`](ltx-director/) for install/test notes and [`research/LTX_DIRECTOR_AUTOMATION.md`](../research/LTX_DIRECTOR_AUTOMATION.md) for evidence and validation gaps.

## Candidate areas

- image/keyframe creation;
- video generation;
- voice/audio/music;
- captions;
- deterministic editing/rendering;
- compositing;
- QC;
- upscale/detail/interpolation;
- provider/model routing;
- async jobs/retries;
- cost and latency accounting.

The existing Runway/n8n asynchronous task pattern belongs conceptually here.

No permanent provider/model is selected.
