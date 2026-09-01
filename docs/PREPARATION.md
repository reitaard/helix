# Preparation Plan

This remains the active phase before Helix brain development begins in earnest.

## Goal

Create enough shared structure that Intelligence, Director, Experiment Engine, and Production can evolve independently without repeatedly breaking each other's interfaces.

Production has already developed a real durable runtime/database boundary. Preparation is therefore no longer about deciding whether Helix can persist Production state; it is about defining the **cross-system vocabulary, contracts, provenance, and ownership boundaries** needed before the brain layers scale.

## 1. Preserve useful existing work

Keep sanitized n8n exports and notes for workflows that teach us something useful.

For each important workflow preserve:

- purpose;
- trigger;
- inputs/outputs;
- external systems;
- credentials by name only;
- state lifecycle;
- failure modes;
- persistence requirements.

The asynchronous generation pattern remains useful Production knowledge, not the central Helix brain contract.

## 2. Establish shared vocabulary and IDs

Initial draft domain objects include:

```text
Niche
EvidenceRef / ResearchSource
ResearchFinding
NicheModel
ContentIdea
ContentSpec
Experiment
Variant / VariantPlan
MediaAsset
PublishedPost
PerformanceSnapshot
```

Names remain provisional. The purpose is to prevent different subsystems from inventing incompatible concepts for the same thing.

Production already has its own durable internal/job/backend identities and a numeric operator media-reference namespace. Do not force those execution identities upward into Intelligence/Director contracts unless a real cross-system requirement exists.

## 3. Establish system boundaries

Preparation should keep these boundaries explicit:

```text
Intelligence      -> NicheModel
Director          -> ContentSpec
Experiment Engine -> VariantPlan / experiment lineage
Production        -> MediaAsset + production metadata
Distribution      -> PublishedPost
Analytics         -> PerformanceSnapshot
```

Exact schemas come next and can evolve during design.

## 4. Define evidence discipline

Intelligence will mix observations, external claims, inferred patterns, and our own experiment results. Every meaningful finding should retain enough information to separate evidence from interpretation:

- source/provenance;
- observation time/window;
- evidence type;
- confidence;
- raw value where practical;
- derived interpretation separately;
- invalidation/recheck status.

This prevents assumptions from quietly becoming facts.

## 5. Persistence boundaries

### Already proven

Production durable state lives outside n8n in `helix-runtime` + PostgreSQL. Media jobs, operator state, deliveries, settings, routing, and related execution truth are not delegated to transient n8n workflow memory.

### Still to design

Persistence technology and schemas for future brain data remain open, including:

- niche/evidence records;
- `NicheModel` snapshots;
- `ContentSpec` versions;
- experiment/variant lineage;
- publishing identity;
- analytics/performance snapshots.

Do not reuse the Production database model by default merely because it already exists.

## 6. Keep Production preparation separate

Production can continue maturing its worker/runtime, semantic settings, generation backends, reference controls, delivery, and reliability independently.

Those implementation details are not prerequisites for designing Intelligence/Director/Experiment logic. The upstream contract should remain stable even if Production later switches away from LTX, FLUX, ComfyUI, or the current worker topology.

## 7. Add custom services only for real boundaries

Do not create microservices merely because the conceptual diagram has boxes.

Introduce code/services when there is a clear state, performance, reliability, ownership, or API boundary that n8n/documents alone cannot handle well.

The speech foundation is an example of a scoped technical service area: local STT has been validated, but it should not become a production service until the Telegram voice-input requirement is implemented and justified.

## Preparation exit condition

Preparation is good enough to move into Niche Intelligence when:

- system divisions are documented and accepted;
- shared object vocabulary is drafted;
- evidence/provenance rules are drafted;
- stale generation-first assumptions are removed;
- Production identities/contracts are kept behind the correct boundary;
- existing workflows are preserved without dictating brain architecture;
- the next Intelligence design questions are explicit.

The next main brain phase remains **Niche Intelligence design**, with platform-first evidence collection as the intended research direction.
