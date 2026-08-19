# Preparation Plan

This is the active phase before Helix brain development begins.

## Goal

Create enough shared structure that Intelligence, Director, Experiment Engine, and Production can evolve independently without repeatedly breaking each other's interfaces.

## 1. Preserve useful existing work

Keep sanitized n8n exports and notes for workflows that already teach us something useful.

For each workflow preserve:

- purpose;
- trigger;
- inputs/outputs;
- external systems;
- credentials by name only;
- state lifecycle;
- failure modes;
- persistence requirements.

The existing asynchronous video task workflow is **preserved as Production knowledge**, not promoted to the central Helix system contract.

## 2. Establish shared vocabulary and IDs

Initial draft domain objects:

```text
Niche
ResearchSource
ResearchFinding
NicheModel
ContentIdea
ContentSpec
Experiment
Variant
MediaAsset
PublishedPost
PerformanceSnapshot
```

These names are provisional. The purpose is to prevent different subsystems from inventing incompatible concepts for the same object.

## 3. Establish system boundaries

Preparation should make these boundaries explicit:

```text
Intelligence → NicheModel
Director → ContentSpec
Experiment Engine → VariantPlan / Experiment lineage
Production → MediaAsset
Distribution → PublishedPost
Analytics → PerformanceSnapshot
```

The exact schemas come next and can change during design.

## 4. Define evidence discipline

Intelligence will mix observations, external claims, inferred patterns, and our own experiment results. Every meaningful finding should be able to retain:

- source/provenance;
- observation time;
- evidence type;
- confidence;
- raw value where practical;
- derived interpretation separately;
- invalidation/recheck status.

This prevents assumptions from quietly becoming facts.

## 5. Decide persistence boundaries

Before implementing stateful algorithms, decide where durable records should live versus transient n8n execution state.

Likely durable categories include niche research, content specs, experiment lineage, media metadata, published-post identity, and performance snapshots. Exact technology is not selected yet.

## 6. Keep Production preparation separate

Production may later need provider-neutral jobs, task states, storage, queues, GPU workers, and media processing. We can preserve those patterns now, but they are not prerequisites for designing the Intelligence/Director/Experiment algorithms.

## 7. Add custom services only for real boundaries

Do not create microservices merely because the future diagram contains boxes. Introduce code when there is a clear state, performance, reliability, ownership, or API boundary that n8n/documents alone cannot handle well.

## Preparation exit condition

Preparation is good enough to move into Niche Intelligence when:

- the system divisions are documented;
- shared object vocabulary is drafted;
- evidence/provenance rules are drafted;
- stale generation-first assumptions are removed;
- existing workflows are preserved without dictating the brain architecture;
- the next Intelligence design questions are explicit.