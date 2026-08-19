# Helix

Helix is a planned high-throughput short-form content intelligence, directing, experimentation, production, distribution, and feedback system for YouTube Shorts, Instagram Reels, and similar platforms.

The project is intentionally divided so that the **brain of the system is independent from generation technology**. Video/image/audio generation is a replaceable Production concern, not the core decision-maker.

## Current status

**Preparation / foundation phase.**

After preparation, the active development path is:

```text
Intelligence
  → Director
  → Experiment Engine
```

Production/generation will be developed as a separate branch and connected through stable briefs/contracts later.

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

No Director component should depend on a specific model such as Seedance, Wan, H3, Runway, or any future provider.

Anything not recorded as a decision remains a working assumption until validated.