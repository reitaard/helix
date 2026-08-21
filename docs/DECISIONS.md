# Decisions

Only choices we are willing to treat as current project commitments belong here. Uncertain ideas belong in `ASSUMPTIONS.md`.

## 2026-08-19 — Project name

**Decision:** Helix.

**Reason:** The intended system iterates through content variants, measurement, selection, and further variants.

## 2026-08-19 — Preparation before implementation scale

**Decision:** Build shared vocabulary, boundaries, workflow hygiene, and evidence discipline before committing to large infrastructure.

## 2026-08-19 — Divide the system by responsibility

**Decision:** Helix is divided into Foundation, Intelligence, Director, Experiment Engine, Production, Distribution, and Analytics/Feedback.

**Reason:** Research/decision logic, experimentation logic, and media execution need independent boundaries so one can evolve without locking the others to a specific tool or provider.

## 2026-08-19 — Brain development precedes generation integration

**Decision:** After preparation, the main development order is `Intelligence → Director → Experiment Engine`. Production/generation is a separate workstream and will connect later through stable briefs/contracts.

**Reason:** The valuable decision system should determine what to make and what to test independently of the current generation technology.

## 2026-08-19 — Director is production-agnostic

**Decision:** Director outputs must not depend on a specific model/provider.

**Reason:** Seedance, Runway, open models, editors, renderers, and future production methods should be interchangeable execution options.

## 2026-08-19 — Preserve asynchronous generation pattern as Production knowledge

**Decision:** Keep the known `create task → task id → status/result → normalized output` pattern for generation workflows, but do not treat it as the central Helix brain contract.

**Reason:** It remains useful for Production integration while no longer dictating project order.

## 2026-08-21 — Tool-specific directors stay inside Production

**Decision:** Tool-specific generation/control layers such as LTX Director and ComfyUI workflow state belong inside Production adapters. They are not the Helix Director contract.

**Reason:** Helix Director should express creative intent independently. Production can translate that intent into timeline segments, keyframes, IC-LoRA guidance, audio controls, retake regions, sampler/model settings, or equivalent backend-specific controls without coupling the brain to one generation stack.
