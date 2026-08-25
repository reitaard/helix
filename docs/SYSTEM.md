# Helix System Outline

> Working system division. Component internals remain provisional until designed and validated.

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

The Director should output a media-agnostic creative specification. Production can later fulfill that specification using hosted models, open-weight models, editing tools, stock media, deterministic renderers, human work, or combinations of them.

Example boundary:

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

Prepare repository conventions, shared identifiers, data contracts, workflow preservation, secrets/configuration practices, and boundaries between n8n and durable application state.

Preparation should not be dominated by generation-provider implementation.

## 1. Intelligence

Expected responsibilities:

- niche definition and sub-niche mapping;
- source discovery;
- content/example ingestion;
- feature extraction from successful and unsuccessful content where data is available;
- hook/format/topic/visual/narrative pattern clustering;
- trend versus evergreen separation;
- saturation/novelty observations;
- evidence provenance and confidence;
- creation of a queryable `NicheModel`.

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

The Director consumes Intelligence and produces a `ContentSpec` or equivalent creative brief.

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

Production is deliberately separate. Candidate internal areas include image, video, audio, voice, captions, editing, compositing, QC, upscaling, and rendering.

Provider/model routing belongs here. The existing asynchronous generation workflow pattern should be preserved as useful implementation knowledge, but it is not the main Helix brain contract. A physical worker may expose multiple logical Production Profiles while retaining one adapter, endpoint, queue, and GPU concurrency limit; model implementations remain replaceable infrastructure.

## 5. Distribution

Future platform-specific publishing adapters, scheduling, metadata, account handling, and supported automation interfaces.

## 6. Analytics / Feedback

Collect observed platform and operational metrics, normalize them into `PerformanceSnapshot`-like records, and return evidence to Intelligence/Director/Experiment logic.

## Current build order

1. finish preparation and shared conceptual contracts;
2. design Niche Intelligence from first principles;
3. design Director skills and `ContentSpec` boundary;
4. design Experiment Engine algorithms and lineage;
5. develop Production separately and connect it to the brief/variant contract;
6. then Distribution and full feedback automation.

## Production execution checkpoint

Production currently uses one physical `helix-rtx4060-01` RTX 4060 worker,
one Comfy endpoint/adapter/queue, and one physical concurrent GPU job. `nolan`
and `leibovitz` are logical Production Profiles on that worker, not separate
execution infrastructure. The first image path is the experimental
`image.t2i` Distilled-FP8 variant; Telegram exposes only semantic aspect and
seed while the runtime binds the supplied workflow at prompt, dimensions, and
concrete seed. FLUX validation is earned only by a real successful RTX 4060
run, not by code integration.

## Principle

Optimize the learning-and-decision system. Treat media-generation technology as replaceable execution infrastructure.