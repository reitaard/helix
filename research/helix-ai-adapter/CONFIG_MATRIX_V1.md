# Qwen3 0.6B Configuration Matrix V1

**Run:** 2026-08-26

**Model:** Qwen3 0.6B Q8_0 (`helix-qwen3-0.6b`)

**Fixtures, V1 system prompts, response schemas, and gold expectations:** unchanged

**Repeats:** 3 per case and configuration

## Why this rerun exists

The original benchmark measured only deterministic non-thinking inference. Official Qwen guidance describes Qwen3 as a hybrid thinking/non-thinking model and recommends sampling rather than temperature-zero decoding. This matrix checks whether the earlier rejection was caused by that configuration.

Official references:

- <https://huggingface.co/Qwen/Qwen3-0.6B>
- <https://qwenlm.github.io/blog/qwen3/>

## Configurations

| Profile | Reasoning | Sampling | Prompt change |
|---|---|---|---|
| `deterministic-nonthinking` | off | temperature 0 | none |
| `official-nonthinking` | off | temperature 0.7, top-p 0.8, top-k 20 | none |
| `official-thinking-64` | on, 64-token server budget | temperature 0.6, top-p 0.95, top-k 20 | none |
| `thinking-64-few-shot` | on, 64-token server budget | temperature 0.6, top-p 0.95, top-k 20 | disclosed examples added as messages |

The Q8 model, V1 fixtures, V1 system prompts, schemas, and expected answers remained fixed. Few-shot is intentionally a separate profile because its added example messages are a prompt change.

## Important thinking-mode limit

This was not an unrestricted-thinking evaluation. On this CPU host, an unrestricted probe generated 128 reasoning tokens in 37.6 seconds and reached the output limit before emitting final JSON. The repeatable matrix therefore capped reasoning at 64 tokens. This tests whether a modest practical thinking budget helps the adapter; it does not establish the model's maximum benchmark ability with unrestricted time.

## Results

Each score is across all three repeats.

### Aspect — 43 cases, 129 outputs

| Profile | Exact | Schema | Repeat consistency | Vertical/portrait |
|---|---:|---:|---:|---:|
| deterministic non-thinking | 60.5% | 100% | 100% | 0/12 |
| official non-thinking | 57.4% | 100% | 55.8% | 0/12 |
| official thinking-64 | 59.7% | 95.3% | 65.1% | 0/12 |
| thinking-64 few-shot | 51.9% | 100% | 37.2% | 8/12 |

A portrait/vertical example taught the model that one mapping better, but total accuracy and stability became worse. The few-shot profile still missed four of twelve vertical/portrait repetitions and degraded exact ratios, unsupported rejection, distractors, and conflicts. Thinking alone did not repair the mapping.

### Exact-physics risk — 34 cases, 102 outputs

| Profile | Exact | Repeat consistency | False positives | False negatives |
|---|---:|---:|---:|---:|
| deterministic non-thinking | 50.0% | 100% | 94.4% | 0% |
| official non-thinking | 49.0% | 94.1% | 96.3% | 0% |
| official thinking-64 | 48.0% | 97.1% | 98.1% | 0% |
| thinking-64 few-shot | 55.9% | 44.1% | 70.4% | 14.6% |

Few-shot reduced over-triggering but introduced missed positive risks and severe instability. No profile is usable as a safety gate.

### Runtime error family — 34 cases, 102 outputs

| Profile | Exact | Schema | Repeat consistency |
|---|---:|---:|---:|
| deterministic non-thinking | 70.6% | 100% | 100% |
| official non-thinking | 65.7% | 100% | 94.1% |
| official thinking-64 | **77.5%** | 100% | 82.4% |
| thinking-64 few-shot | 54.9% | 100% | 52.9% |

Thinking improved worker and unknown classifications, proving that configuration can matter. It still failed the required accuracy and stability, and submission rejection remained only 3/15. The chosen few-shot examples made performance worse rather than better.

### Shot structure — 34 cases, 102 outputs

| Profile | Exact | Schema | Repeat consistency |
|---|---:|---:|---:|
| deterministic non-thinking | 35.3% | 100% | 100% |
| official non-thinking | 33.3% | 100% | 91.2% |
| official thinking-64 | 36.3% | 100% | 79.4% |
| thinking-64 few-shot | **52.9%** | 100% | 52.9% |

Examples helped explicit multi-shot recognition (21/24), but the model still almost never returned `unclear` correctly and became unstable. It learned the demonstrated surface pattern without reliably applying the full decision boundary.

## Latency caveat

The matrix ran on the live shared CPU host, and the temporary thinking server coexisted with the detached non-thinking service. Latency therefore measures practical order of magnitude, not an isolated performance benchmark. Thinking profiles generally took seconds per response, with long-tail cases above ten seconds. Accuracy and repeat consistency are the primary conclusions.

## Corrected conclusion

The original configuration was not the only problem:

- Official non-thinking sampling did not improve any task and reduced determinism.
- A practical thinking budget improved error-family classification but not enough for production.
- Few-shot examples demonstrated that the model can learn selected mappings, including vertical to `9:16`, but improvements did not generalize safely and stability fell sharply.

Therefore the evidence supports this narrower statement:

> Qwen3 0.6B Q8 has semantic capability, but none of the tested configurations provides a reliable Helix production adapter for these contracts.

This is not evidence that Qwen3 as a family is weak, nor that unrestricted thinking or a larger Qwen3 model would fail. It is evidence against deploying this 0.6B model automatically for the tested Helix decisions.

## Reproduction

The temporary thinking endpoint must run with the same model and a 64-token reasoning budget. Then run, for example:

```bash
python3 config_matrix_benchmark.py \
  --task aspect \
  --profile official-thinking-64 \
  --repeat 3
```

Raw result JSON remains ignored under `results/`.
