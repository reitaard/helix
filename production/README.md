# Production

Production is the execution layer. It is intentionally separate from Intelligence, Director, and Experiment Engine.

## Purpose

Turn an approved `ContentSpec` / `VariantPlan` into media while preserving production metadata and lineage.

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