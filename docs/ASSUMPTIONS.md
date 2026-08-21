# Working Assumptions

Everything in this file is **unconfirmed until validated by implementation, measurement, or authoritative evidence**. Move an item to `DECISIONS.md` only when we are ready to rely on it.

## Brain assumptions

- A machine-readable `NicheModel` will be more useful than a flat collection of research links.
- Separating Intelligence, Director, and Experiment Engine will improve attribution and iteration compared with one monolithic agent.
- Content examples can likely be decomposed into useful features such as topic, hook family, format, duration, pacing, visual style, information timing, and ending behavior.
- Our own measured experiments should eventually outweigh generic creator folklore when enough data exists.
- Controlled mutation of a small number of variables should teach us more than producing many unrelated videos.

## System assumptions

- Helix will probably need both orchestration workflows and persistent application state.
- n8n will probably remain useful for integration/orchestration but may not be the right place for high-volume stateful algorithms.
- Durable provenance/lineage will likely be important across research, creative specs, experiments, production, publishing, and analytics.
- Reitaard will likely be an interface layer rather than the location of core Helix logic.

## Production assumptions

- Generation should remain replaceable and separate from the Director.
- Different production backends may be better for different creative specifications and quality/cost targets.
- Open/self-hosted models may reduce marginal cost in some workloads, but this still requires measurement.
- Shot-based/reference-driven production, post-processing, QC, and regeneration may improve reliability for some formats.
- A machine-readable Production execution plan may provide a useful boundary between `ContentSpec` / `VariantPlan` and backend-specific workflow state.
- Agents will likely be more reliable when they compile structured production state and use APIs, while humans provide subjective review/overrides, than when agents attempt to automate visual editing interfaces directly.

## Platform assumptions

- Distribution behavior can change, so platform claims require dates/provenance.
- Account health and platform-integrity constraints remain relevant even when monetization is not a goal.
- Publishing and analytics automation should prefer officially supported interfaces where practical.

## Validation rule

Do not encode assumptions as irreversible architecture. Preserve the evidence needed to prove, refine, or reject them.
