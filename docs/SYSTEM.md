# Helix System Outline

> Canonical system division. Component internals remain provisional until designed and validated.

## Objective

Helix is not primarily a video generator. It is intended to become a system that researches a niche, develops creative direction, designs controlled content experiments, executes production through replaceable tools, publishes, measures outcomes, and feeds evidence back into later decisions.

## System divisions

```text
0. FOUNDATION / PREPARATION
          ↓
1. INTELLIGENCE
   niche research + content understanding
          ↓
2. DIRECTOR
   what to make + how it should work creatively
          ↓
3. EXPERIMENT ENGINE
   what variable to test + selection/mutation logic
          ↓
4. PRODUCTION
   generation/editing/voice/images/video/captions
          ↓
5. DISTRIBUTION
   publishing + scheduling + platform adapters
          ↓
6. ANALYTICS / FEEDBACK
   observed performance
          └──────────────→ Intelligence / Director / Experiment Engine
```

## Boundary rule

The upstream brain must not know how media is generated.

The Director should output a media-agnostic creative specification. Production can fulfill that specification using hosted models, open-weight models, editing tools, stock media, deterministic renderers, human work, or combinations of them.

```text
NicheModel + Objective
        ↓
Director
        ↓
ContentSpec
        ↓
Experiment Engine
        ↓
VariantPlan
        ↓
Production
        ↓
MediaAsset
```

## 0. Foundation / Preparation

Prepare repository conventions, shared identifiers, data contracts, workflow preservation, secrets/configuration practices, provenance rules, and boundaries between n8n and durable application state.

Production already has a real PostgreSQL/runtime persistence boundary. Persistence technology for future Intelligence/Director/Experiment data remains intentionally undecided.

## 1. Intelligence

Expected responsibilities:

- niche definition and sub-niche mapping;
- source discovery and ingestion;
- feature extraction from content examples;
- hook/format/topic/visual/narrative pattern clustering;
- trend versus evergreen separation;
- saturation/novelty observations;
- evidence provenance and confidence;
- creation of a queryable `NicheModel`.

The current intended direction is platform-first evidence from YouTube/Facebook/Reels-style observations, supplemented by wider web research rather than replaced by generic web search.

## 2. Director

Expected skills are separate concerns rather than one giant agent:

- concept direction;
- hook direction;
- narrative/information timing;
- pacing;
- visual direction;
- audio direction;
- format adaptation;
- critic/review.

The Helix Director consumes Intelligence and produces a `ContentSpec` or equivalent creative brief. Tool-specific systems named "Director" inside Comfy/LTX remain Production implementation details.

## 3. Experiment Engine

Expected responsibilities:

- define hypotheses;
- choose controlled variables;
- create variants;
- preserve controls where practical;
- assign experiment/cohort/variant IDs;
- define evaluation windows;
- score results cautiously;
- detect winners without overreacting to noise;
- decide discard / continue / mutate / scale;
- preserve lineage so later learning is attributable.

This is expected to become a central algorithmic layer of Helix.

## 4. Production

Production owns generation/editing execution and backend-specific controls.

The active Production boundary is now real rather than hypothetical:

```text
caller / n8n / Telegram
        ↓
helix-runtime + PostgreSQL
        ↓
semantic Production settings / binders
        ↓
Comfy adapter
        ↓
helix-rtx4060-01
```

One physical RTX 4060 worker currently exposes logical Production Profiles:

```text
nolan / Christopher Nolan
-> video.i2v
-> video.t2v

leibovitz / Annie Leibovitz
-> image.t2i
```

These are logical tool authorities on one Comfy endpoint, one queue, and one physical GPU concurrency limit.

The operator-facing identity model uses one durable numeric media-reference namespace shared across Helix jobs and direct ComfyUI artifacts. Internal Helix IDs and Comfy Prompt IDs remain separate.

Current image execution uses FLUX.2 Klein 4B INT8 W8A8 as the active T2I workflow candidate; the earlier Distilled FP8 path remains a validated rollback route.

Current video execution uses native LTX 2.5 as the first-choice focused-shot path. Prompt Relay, LTX Director, reference conditioning, continuation systems, sampler/model state, and raw Comfy node IDs remain behind the Production boundary.

Reference-conditioning research has locally demonstrated both Licon MSR one-subject new-scene identity retention and Lightricks Ingredients Core IC-LoRA person + product + location reconstruction. These are research controls, not frozen Helix schemas.

Speech also belongs to Production. Moonshine STT is locally validated as a foundation, but Telegram voice integration is not implemented.

## 5. Distribution

Future platform-specific publishing adapters, scheduling, metadata, account handling, and supported automation interfaces.

## 6. Analytics / Feedback

Collect observed platform and operational metrics, normalize them into `PerformanceSnapshot`-like records, and return evidence to Intelligence/Director/Experiment logic.

## Current build order

1. finish preparation and shared conceptual contracts;
2. design Niche Intelligence from first principles;
3. design Director skills and `ContentSpec` boundary;
4. design Experiment Engine algorithms and lineage;
5. continue Production separately behind stable semantic contracts;
6. then Distribution and full feedback automation.

## Principle

Optimize the learning-and-decision system. Treat media-generation technology as replaceable execution infrastructure.

For the detailed current checkpoint, see [`PROJECT_STATE.md`](PROJECT_STATE.md).
