# Terra Brief — Detached Qwen Use-Case Benchmarks

> **Research status:** POSTPONED AND LOCKED — historical handoff only; see `RESEARCH_LOCK.md`.

## Objective

Run and report three independent, read-only Qwen experiments that may support future Helix Production research without controlling Production:

1. exact-physics prompt-risk detection;
2. runtime error-family classification;
3. explicit shot-structure interpretation.

Terra is the Recode agent conducting the benchmark. The model under test remains the detached inference model named on the command line.

## Hard boundary

Do not:

- modify or call `production/media-runtime`;
- access Telegram or PostgreSQL;
- call ComfyUI or submit/cancel/retry a job;
- generate media;
- change fixture expectations, prompts, or schemas before recording V1;
- combine task outputs into routing, settings, modes, or execution decisions;
- describe a passing benchmark as production integration.

The benchmark calls only:

```text
http://127.0.0.1:8181/health
http://127.0.0.1:8181/v1/chat/completions
```

## Required reading

1. `research/helix-ai-adapter/INSPECTED_CONTRACT.md`
2. `research/helix-ai-adapter/ASPECT_V1.md`
3. `production/ltx-director/NATIVE_T2V.md`
4. `research/helix-ai-adapter/use_case_benchmark.py`
5. the three fixtures under `research/helix-ai-adapter/cases/`

## V1 commands

From `/opt/helix`:

```bash
python3 research/helix-ai-adapter/use_case_benchmark.py \
  --task exact-physics-risk \
  --model helix-qwen3-0.6b

python3 research/helix-ai-adapter/use_case_benchmark.py \
  --task error-family \
  --model helix-qwen3-0.6b

python3 research/helix-ai-adapter/use_case_benchmark.py \
  --task shot-structure \
  --model helix-qwen3-0.6b
```

If the server exposes a different alias, inspect `/v1/models` and pass that exact alias through `--model`. Do not edit the benchmark default solely to run an alias.

## Stability rerun

Only after all three one-repeat V1 runs are saved, rerun a promising task with:

```bash
python3 research/helix-ai-adapter/use_case_benchmark.py \
  --task TASK_NAME \
  --model MODEL_ALIAS \
  --repeat 3
```

Do not use the repeated run to tune V1 expectations.

## Reporting requirements

For each task report:

- exact accuracy;
- schema validity;
- every category score;
- confusion patterns;
- p50/p95 latency;
- fixture SHA-256 and prompt version;
- representative false positives, false negatives, and unsafe coercions;
- whether a deterministic classifier would be simpler or safer.

Use these research gates:

```text
Schema validity                   100%
Overall exact accuracy             >= 95%
Every safety-relevant category     >= 90%
False-positive behavior            <= 5%
Three-run consistency              >= 98%
```

For `error-family`, Qwen must also offer a demonstrated advantage over deterministic event-type/message mappings. High accuracy alone is not sufficient.

## Interpretation

These operations are advisory research candidates only. Even a passing result does not authorize runtime use. A valid outcome for every task is no AI integration.

Prompt rewriting, experiment-note normalization, and generated-video comparison are not included in this batch because they require different human-evaluation protocols, and video comparison would require media generation outside this detached test boundary.
