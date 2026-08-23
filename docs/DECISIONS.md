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

## 2026-08-23 — Production workers stay pinned; update awareness is read-only

**Decision:** The active ComfyUI worker uses an explicit production revision pin. Helix may compare that revision with official upstream state for operator visibility, but it must not automatically update the worker.

**Reason:** ComfyUI, custom nodes, PyTorch/CUDA behavior, and LTX workflow compatibility form one validated execution stack. Upstream drift is useful information; mutation of the production worker requires an explicit inspect → update → restart → validation checkpoint.

## 2026-08-23 — Telegram is an operator surface, not a general control plane

**Decision:** Telegram lives inside `helix-runtime` as a narrow operator surface. It may expose diagnostics, queue/job/outbox inspection, durable debug views, operational alerts, explicitly confirmed media-job cancellation, and explicitly confirmed T2V generation, but not restart, shell, package-update, or arbitrary worker-mutation actions.

**Reason:** Telegram is useful for compact operational visibility and bounded intervention, while low-level execution ownership remains in Helix runtime/worker boundaries. Restricting access to the configured chat ID and keeping the command surface intentionally small preserves that boundary.

## 2026-08-23 — Telegram cancellation requires durable terminal-style confirmation

**Decision:** `/cancel <id>` and hidden alias `/cc` create one durable pending action for the configured operator chat, expire after 60 seconds, and require a case-insensitive `yes` or `no`. Three invalid responses abort the request. A new slash command silently abandons the pending confirmation.

**Reason:** Job cancellation is already owned by `JobService`, so Telegram should only provide a guarded operator path into that existing service. Durable pending state preserves intent and survives runtime restarts without introducing destructive buttons or direct Comfy control.

## 2026-08-23 — Operational alerts are durable and deduplicated

**Decision:** Failed/timed-out jobs, terminal Outbox failures, and confirmed worker offline/recovered transitions may proactively alert the configured Telegram operator. Event-derived alerts are persisted and deduplicated; worker transition alerts require consecutive observations and a cooldown.

**Reason:** Operator notification must not depend on a single process tick or flood the chat during polling/restart. Durable alert rows, a migration-time event cursor, bounded send retry, transition thresholds, and cooldown provide observability without turning transient observations into repeated noise.

## 2026-08-24 — Telegram T2V generation requires pre-submit confirmation

**Decision:** Receiving a T2V prompt must not immediately spend GPU time. `/t2v` captures the prompt durably, previews it, and requires terminal-style `yes` / `no` confirmation before `JobService.create()` is called.

**Reason:** Generation is a meaningful compute action and operator text may contain mistakes. Prompt entry and execution intent must remain separate.

## 2026-08-24 — Initial T2V semantic surface is prompt-only

**Decision:** The first validated native LTX 2.5 T2V binding mutates only `405:376.inputs.value` in the vetted runtime workflow. Prompt enhancement remains disabled and the current resolution/aspect, duration, FPS, negative prompt, model and sampler controls remain workflow-defined.

**Reason:** The full T2V settings contract has not been designed yet. A narrow binding proves the end-to-end Production path without prematurely freezing unstable Comfy node controls as public Helix semantics.

## 2026-08-24 — T2V settings must be Helix semantics, not raw Comfy node controls

**Decision:** Future T2V settings should expose stable concepts such as aspect ratio, duration, quality/resolution preset and prompt enhancement first. Seed, negative prompt, sampler/model tuning and workflow-specific values remain advanced/internal until their value and stability are proven.

**Reason:** The operator surface should remain understandable and portable across future workflow revisions. Raw node IDs and model-specific sampler details are implementation details, not the long-term Production contract.

## 2026-08-24 — WebSocket event readiness is advisory

**Decision:** A transient Comfy WebSocket events-probe timeout does not by itself mark an otherwise execution-ready worker `Degraded`. Runtime reachability, queue access and capability inspection determine execution readiness; event-socket errors remain visible as diagnostics.

**Reason:** Helix job correctness comes from durable queue/history reconciliation. Treating one optional event probe as the entire worker state made `/status` flap despite successful active generation.

## 2026-08-24 — Telegram artifact captions identify the Helix tool

**Decision:** Generated artifact captions use the actual media tool such as `[video.t2v]` instead of a generic Comfy heading, and use the configured worker presentation name rather than the durable worker ID.

**Reason:** Operator output should describe the Helix action that produced the artifact while preserving durable IDs internally. Presentation naming and execution identity remain separate concerns.
