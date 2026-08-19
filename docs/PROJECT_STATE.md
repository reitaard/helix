# Project State

## Current phase

Preparation / foundation.

We are not implementing the full Helix architecture yet. The immediate goal is to organize the pieces we will need, preserve working workflow patterns, and turn uncertain future ideas into clearly tracked assumptions.

## Known direction

- short-form video production and experimentation;
- YouTube Shorts / Instagram Reels as initial target surfaces;
- n8n is already useful for orchestration;
- generation jobs are asynchronous and should have a normalized lifecycle;
- Reitaard is expected to become the application shell/interface around multiple workflows;
- generation backends should remain replaceable.

## Existing work to preserve

- n8n create-task → task-status → output-URL pattern;
- current Runway workflow concepts;
- Reitaard mobile shell concept;
- provider/model comparison work as future input, not a locked decision;
- shot-based production, references/keyframes, QC, upscaling, and post-processing as possible later pipeline stages.

## Preparation checklist

- [ ] Commit sanitized n8n workflow exports as they stabilize.
- [ ] Define a provider-neutral generation job schema.
- [ ] Define normalized job states and failure/retry behavior.
- [ ] Define media asset metadata and storage conventions.
- [ ] Define project / content / experiment / variant IDs.
- [ ] Define configuration and secret names in `.env.example`.
- [ ] Decide what state belongs in n8n versus an application database.
- [ ] Define the boundary between Reitaard UI, orchestration, and worker services.
- [ ] Add reproducible local development setup once the first service is chosen.
- [ ] Validate platform, model, infrastructure, and economics assumptions before promoting them to decisions.

## Near-term implementation order

1. Repository and workflow hygiene.
2. Common job contract.
3. Workflow persistence/state model.
4. Provider adapter boundary.
5. Media storage conventions.
6. Minimal service/API only where n8n alone becomes awkward.
7. UI integration after backend contracts stop moving rapidly.
8. Larger-scale generation/analytics architecture later.
