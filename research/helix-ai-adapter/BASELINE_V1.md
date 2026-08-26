# Baseline V1 Observation

> **Research status:** POSTPONED AND LOCKED — preserved evidence; see `RESEARCH_LOCK.md`.

**Run:** 2026-08-25

**Model:** `helix-qwen3-0.6b` (Qwen3 0.6B Q8_0)

**Cases:** `production-settings-v1` (70 cases, one deterministic run each)

**Prompt/schema:** `production-settings-baseline-v1`

## Result

```text
Exact accuracy:          0/70 (0.0%)
Status accuracy:         17.1%
Schema/JSON validity:   100.0%
Change precision:        10.5%
Change recall:           42.4%
No-settings FP:          10/10 (100.0%)
Latency p50:             2579 ms
Latency p95:             3914 ms
```

Every category scored `0` on exact-object accuracy.

## Direct observation

The dominant behavior was not random malformed output. The model repeatedly copied the entire `currentSettings` object into `changes`, often paired with `status=no_settings`, instead of emitting a semantic delta.

Representative failure:

```text
Input: Make this one vertical.
Current aspect: 16:9

Expected:
{"status":"ok","changes":{"aspect":"9:16"},...}

Observed:
{"status":"no_settings","changes":{"aspect":"16:9","quality":"standard","durationSeconds":5,"enhance":false},...}
```

This also explains the 100% false-positive rate for no-settings controls: status was often correct, but the model still emitted all current fields as changes.

## Interpretation

The baseline disproves the assumption that a single relatively rich delta/conflict/unsupported contract will work without additional task decomposition or examples.

It does **not** yet prove that Qwen cannot interpret individual settings. The benchmark currently combines:

```text
settings-vs-prompt classification
field extraction
current-state arithmetic
correction resolution
conflict detection
unsupported detection
delta omission discipline
```

That is too many responsibilities to diagnose from one score.

## Next variable to test

Do not tweak gold expectations. Keep V1 as the regression suite.

The next experiment should decompose the task, beginning with one field and one tiny output contract:

```text
interpretAspect(text)
→ {"matched":true|false,"value":"9:16"|...}
```

Run direct aspect values, natural aliases, and no-settings aspect distractors. If that succeeds, repeat independently for quality, duration, and enhancement. Only then test combining proven field parsers into a delta.

A second useful experiment is a two-stage boundary:

```text
1. Does this text contain an explicit settings instruction?
2. If yes, extract one requested field.
```

Do not integrate or apply any output while these experiments continue.

## Artifact handling

The full raw result was generated under `research/helix-ai-adapter/results/` and is intentionally ignored by Git. This concise note is the durable research record.
