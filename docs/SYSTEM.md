# Helix System Outline

> Working architecture. This is a design baseline, not the final deep-research report.

## Objective

Build a high-throughput short-form content experimentation engine that can cheaply test many original content hypotheses, measure actual audience response, and use the resulting data to improve future production decisions.

## Core loop

```text
Trend / niche inputs
      ↓
Research + idea engine
      ↓
Hook / script / shot planning
      ↓
Asset + video production
      ↓
Quality control
      ↓
Publishing queue
      ↓
YouTube Shorts / Instagram Reels
      ↓
Analytics ingestion
      ↓
Experiment scoring
      ↓
Winner detection
      ↓
Variant generation
      ↺
```

## Proposed components

- Director / planning agent
- Niche and trend research layer
- Hook and script generation
- Shot planner and reusable asset manager
- Model router for open and hosted generation backends
- Generation job queue and GPU workers
- Object storage for media assets
- Publishing scheduler / platform adapters
- Analytics ingestion
- Experiment database
- Winner/loser scoring and feedback loop
- Reitaard app interface
- n8n orchestration where it remains useful

## Current model strategy

Do not assume one model must perform every job. Use cheaper/open workers for exploration and reserve expensive hosted models for cases where their extra quality materially affects the experiment.

Candidate categories currently under investigation:

- Omni-modal/reference-driven video models
- Fast image-to-video models
- Controlled/VFX-oriented video models
- Image/keyframe generation
- Upscaling/detail restoration
- Audio/voice/music
- Automated QC

## Guiding principle

Optimize the complete production-and-learning system rather than benchmark scores from a single model.
