# Decisions

Only choices we are willing to treat as current project commitments belong here. Uncertain ideas belong in `ASSUMPTIONS.md` until validated.

## 2026-08-19 — Project name

**Decision:** Helix

**Reason:** The intended system iterates through content variants, measurement, selection, and further variants.

## 2026-08-19 — Preparation before scale architecture

**Decision:** Build the project foundation and stable interfaces before committing to the large-scale architecture.

**Reason:** Provider capabilities, platform behavior, economics, and implementation needs can change. Stable contracts reduce rework while keeping future choices open.

## 2026-08-19 — Provider-neutral asynchronous job pattern

**Decision:** Preserve the existing asynchronous task pattern as the baseline interface for generation workflows.

**Current shape:** create task → task id → status/result lookup → normalized output metadata.

**Reason:** This pattern already matches the current Runway workflow and can later be adapted to additional hosted or self-hosted backends.
