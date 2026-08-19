# Working Assumptions

Everything in this file is **unconfirmed until validated by implementation, measurement, or authoritative platform/provider documentation**. Move an item to `DECISIONS.md` only when we are ready to rely on it.

## System assumptions

- Helix will probably need both orchestration workflows and persistent application state.
- n8n will probably remain useful for integration/orchestration but may not be the right place for every high-volume stateful component.
- A provider/model routing layer may become useful when multiple generation backends are active.
- Media assets will probably need external object storage rather than living inside workflow state.
- A queue may become necessary once concurrent generation volume exceeds what a simple workflow can manage reliably.
- Analytics and experiment scoring are later-stage capabilities, not preparation blockers.

## Production assumptions

- Different generation backends will likely be better at different shot types and quality/cost targets.
- Some open/self-hosted models may eventually reduce marginal generation cost, but hardware and operational economics still need to be measured against hosted APIs.
- Shot-based generation, reference assets, post-processing, QC, upscaling, and regeneration may produce more reliable outputs than relying on a single end-to-end prompt.

## Platform assumptions

- Performance should be learned from our own measured content experiments rather than relying on creator folklore.
- Publishing and analytics automation should use officially supported interfaces where possible.
- Account health and platform-integrity constraints remain relevant even when monetization is not the goal.

## Validation rule

Do not encode these assumptions as irreversible architecture. Prefer replaceable adapters, explicit metadata, and experiments that can prove or disprove them.
