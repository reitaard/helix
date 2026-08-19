# Project State

## Current phase

**Preparation / foundation.**

The system division is now established at a high level. We are not building the complete architecture yet.

## Current direction

The primary post-preparation workstream is the **Helix brain**:

```text
Niche Intelligence → Director → Experiment Engine
```

Generation/production is a separate workstream. It will be connected later through stable creative/variant briefs rather than being allowed to shape the Intelligence or Director architecture.

## Current project divisions

- Foundation / Preparation
- Intelligence
- Director
- Experiment Engine
- Production
- Distribution
- Analytics / Feedback

## Existing implementation knowledge to preserve

- n8n orchestration experience;
- asynchronous generation pattern: create task → task id → status/result → output;
- Runway workflow concepts and task-monitor behavior;
- Reitaard as a future application shell/interface;
- previous provider/model/workflow research as provisional future Production input.

These are preserved without making generation the current implementation priority.

## Preparation checklist

- [ ] Keep sanitized n8n exports as workflows stabilize.
- [ ] Define common IDs and object names across system divisions.
- [ ] Define draft contracts for `Niche`, `ResearchFinding`, `NicheModel`, `ContentIdea`, `ContentSpec`, `Experiment`, `Variant`, `MediaAsset`, `PublishedPost`, and `PerformanceSnapshot`.
- [ ] Define evidence/provenance requirements for Intelligence research.
- [ ] Decide what durable state must live outside n8n.
- [ ] Keep real credentials outside git and document configuration names only when introduced.
- [ ] Document Reitaard ↔ Helix boundaries when the backend contracts become clearer.
- [ ] Preserve provider-neutral generation job notes inside Production/workflows without making them a blocker for Intelligence work.

## Next phase

**Niche Intelligence design.**

The next design work should answer:

1. What exactly is a niche in Helix?
2. What sources and observations enter the Intelligence system?
3. What features should be extracted from content/examples?
4. How do we represent hooks, formats, topics, pacing, visuals, narrative structure, audience, saturation, novelty, and temporal trends?
5. How do we distinguish observed facts from inferred patterns?
6. What does a `NicheModel` contain?
7. How does the Director query and consume it?

## Later

After the Intelligence contract is coherent:

1. Director skill design;
2. Experiment Engine algorithms;
3. separate Production implementation;
4. Distribution;
5. closed-loop Analytics/Feedback.