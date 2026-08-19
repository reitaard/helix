# System Boundaries

This document exists to prevent Helix from collapsing into one giant agent or one giant n8n workflow.

## Intelligence

**Question:** What is happening in this niche and what patterns are supported by evidence?

**Consumes:** sources, examples, observations, platform/content data, previous experiment evidence.

**Produces:** `NicheModel`, research findings, pattern candidates, uncertainty/provenance.

**Must not:** decide how a video is generated.

## Director

**Question:** Given the niche model and objective, what should we make and how should the creative idea work?

**Consumes:** `NicheModel`, objective, constraints, prior experiment lessons.

**Produces:** `ContentSpec`.

**Must not:** depend on a specific video/image/audio model or provider.

## Experiment Engine

**Question:** What do we change, hold constant, test, compare, preserve, discard, or mutate?

**Consumes:** `ContentSpec`, hypotheses, prior experiment lineage/results.

**Produces:** experiment definition, variants/`VariantPlan`, evaluation intent, lineage.

**Must not:** confuse production failures with creative-performance evidence.

## Production

**Question:** How do we manufacture the requested variant faithfully and efficiently?

**Consumes:** `ContentSpec` / `VariantPlan` and assets/references.

**Produces:** `MediaAsset` plus production metadata.

**Owns later:** generation providers/models, editing, rendering, audio, captions, QC, retries, upscale, cost/latency.

## Distribution

**Question:** How is an approved asset published through supported platform interfaces?

**Produces:** `PublishedPost` identity and publishing metadata.

## Analytics / Feedback

**Question:** What actually happened after publication and during production?

**Produces:** `PerformanceSnapshot` and operational observations.

## n8n

n8n is an orchestration tool, not automatically the source of truth or the algorithmic brain. Use it where visual/integration orchestration is convenient; keep durable state and computation-heavy algorithms outside it when those boundaries become necessary.

## Reitaard

Reitaard is expected to be an application shell/interface over Helix capabilities. UI concerns should not dictate core Intelligence/Director algorithms.