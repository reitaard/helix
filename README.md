# Helix

Helix is the high-throughput content experimentation system for discovering, producing, publishing, and iterating short-form video formats across platforms such as YouTube Shorts and Instagram Reels.

The system is designed around a feedback loop:

1. Discover niches, topics, and formats.
2. Generate many original content hypotheses and hooks.
3. Produce short-form videos through modular AI/media pipelines.
4. Publish through controlled queues.
5. Ingest performance analytics.
6. Rank experiments and identify winners.
7. Generate new variants from successful patterns.

## Status

Early architecture / research phase. Current documents capture working assumptions and should not be treated as completed deep research.

## Repository map

- `docs/` — architecture, system design, decisions, and project state
- `research/` — sourced research, platform findings, model evaluations, and experiments
- `workflows/` — n8n workflow exports and orchestration notes
- `infra/` — deployment, queues, storage, GPU workers, observability
- `services/` — application/service implementations
- `experiments/` — experiment definitions, metrics, and evaluation artifacts
