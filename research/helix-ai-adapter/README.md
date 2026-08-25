# Helix AI Adapter — Production Settings Research

**Status:** detached research only

**Branch:** `research/qwen-production-settings`

**Selected research model:** Qwen3 0.6B Q8_0
**Runtime endpoint:** local `helixai-adapter` (`http://127.0.0.1:8181`)

This directory is a self-contained handoff for an AI agent evaluating whether a tiny local model is useful for one bounded Production task: interpreting natural-language changes to the existing T2V settings contract.

It is not an integration and must not add AI to Telegram, `media-runtime`, the database, workflow mutation, or job execution.

## Start here

1. Read [`AGENT_BRIEF.md`](AGENT_BRIEF.md).
2. Read [`INSPECTED_CONTRACT.md`](INSPECTED_CONTRACT.md).
3. Review [`TEST_PLAN.md`](TEST_PLAN.md).
4. Inspect or extend [`cases/production-settings-v1.json`](cases/production-settings-v1.json).
5. Run:

```bash
python3 research/helix-ai-adapter/benchmark.py
```

Results are written under `research/helix-ai-adapter/results/` and ignored by Git except for its README.

## Research boundary

```text
current settings + supported values + one settings sentence
                         ↓
                Qwen semantic parser
                         ↓
               proposed typed delta
                         ↓
          offline validation and scoring only
```

The benchmark performs no database writes, Telegram calls, Comfy calls, workflow edits, or GPU jobs.

## Files

- `AGENT_BRIEF.md` — exact continuation instructions and guardrails.
- `INSPECTED_CONTRACT.md` — source-backed map of the current branch.
- `TEST_PLAN.md` — hypotheses, metrics, gates, and experiment sequence.
- `cases/production-settings-v1.json` — versioned gold cases.
- `benchmark.py` — standalone V1 core-settings benchmark runner.
- `aspect_benchmark.py` — separate `interpretAspect(text)` benchmark runner.
- `use_case_benchmark.py` — detached runner for independent prompt-risk, error-family, and shot-structure experiments.
- `TERRA_USE_CASE_BRIEF.md` — exact handoff for running and reporting the detached use-case suite through Recode.
- `results/README.md` — result retention rules.

## Runtime operations

The detached inference service is documented at `/opt/helix-ai-adapter/README.md`.

```bash
systemctl status helixai-adapter
curl http://127.0.0.1:8181/health
curl http://127.0.0.1:8181/v1/models
```

Do not change model family, quantization, prompt contract, or case expectations in the same experiment. Change one variable at a time and record it.
