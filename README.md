# Helix

Helix is a planned high-throughput short-form video production and experimentation system for YouTube Shorts, Instagram Reels, and similar platforms.

The long-term loop is expected to cover concept discovery, variant generation, media production, publishing, analytics, and iterative improvement. The exact architecture, platform strategy, model stack, and economics are **not locked yet**.

## Current status

**Preparation phase.**

The repository is being used to collect the project structure, interfaces, workflow exports, environment requirements, data contracts, and implementation decisions we will need before building the larger system.

Anything described as a future component or strategy is a **working assumption / candidate direction**, not a confirmed implementation choice.

## Repository map

- `docs/` — system outline, preparation plan, project state, assumptions, and decisions
- `research/` — notes and evidence to validate later; nothing here is automatically a decision
- `workflows/` — n8n exports and workflow-specific documentation
- `infra/` — infrastructure preparation and deployment notes
- `services/` — future service boundaries and application code
- `experiments/` — experiment definitions and results once testing begins

## Current priority

Prepare the foundation first:

1. preserve working n8n workflow patterns and exports;
2. define task/job contracts and state transitions;
3. define environment/secrets requirements without committing credentials;
4. document media inputs/outputs and provider boundaries;
5. define the initial project/experiment data model;
6. identify which choices still need validation before implementation.
