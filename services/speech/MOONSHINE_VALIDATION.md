# Moonshine STT Validation

> Validated on the Helix production VPS on 2026-08-25. This was an isolated speech-engine test. Telegram, media-runtime routing, n8n, ComfyUI, Nolan, Leibovitz, and the Windows GPU worker were not modified or restarted.

## Decision

Moonshine Voice 0.1.5 with the Medium Streaming English model is **conditionally production-worthy** for short English Helix voice prompts.

The model is sub-real-time on the tested 9.96-second sample, starts quickly, and has acceptable resident memory for the current VPS. CPU inference is expensive, so a future long-lived speech component should keep one model resident and serialize transcription. Telegram integration remains blocked on real Telegram voice-note accuracy and domain-vocabulary testing, not on codec or installation viability.

## Installation and model integrity

Validated installation:

```text
Python:       3.12.3
Package:      moonshine-voice 0.1.5
Architecture: 5 / MEDIUM_STREAMING
Model:        medium-streaming-en
Model path:   /opt/helix-speech/models/download.moonshine.ai/model/medium-streaming-en/quantized_26_08_21
```

The installed native catalog identifies architecture 5 as `MEDIUM_STREAMING`, marks it as the default English model, and resolves it to `medium-streaming-en/quantized_26_08_21`.

All expected model components passed catalog size and CRC32C validation:

```text
adapter.ort
cross_kv.ort
decoder_kv.ort
encoder.ort
frontend.model.ort
frontend.weights.ort
streaming_config.json
tokenizer.bin
```

No replacement model or unrelated speech/ML package was downloaded.

## Installed API behavior

The installed Python API loads the model explicitly with:

```python
Transcriber(model_path, ModelArch.MEDIUM_STREAMING)
```

The transcriber wraps the bundled native Moonshine library and loads the model's ORT components from disk. The CLI file command also uses streaming internally: it creates a `Transcriber`, starts a stream, feeds the WAV in 100 ms chunks, stops the stream, and releases the transcriber.

The Python transcriber accepts floating-point PCM samples and an explicit sample rate. The bundled WAV loader accepts PCM WAV with 16-, 24-, or 32-bit integer samples and averages multichannel input to mono. The Helix harness normalizes supported inputs to mono 16 kHz signed 16-bit PCM WAV before transcription.

## Cache configuration in 0.1.5

Verified from the installed source:

- `MOONSHINE_VOICE_CACHE` is the applicable environment variable.
- Its default is the platform cache, currently `/root/.cache/moonshine_voice`.
- `moonshine-voice download --root DIR` is the explicit downloader override.
- `MOONSHINE_CACHE` is not read and has no effect.
- Explicit `--model-path` or `Transcriber(model_path, ...)` bypasses cache discovery for model loading.

The installed deployment should eventually set `MOONSHINE_VOICE_CACHE=/opt/helix-speech/models` in its service environment. No shell-profile change is required.

## Pinned CLI smoke tests

Bundled input:

```text
beckett.wav
Duration: 9.963375 seconds
PCM: 16 kHz, mono, signed 16-bit
```

Both runs explicitly used the installed model path and architecture 5.

Transcript from both runs:

```text
Ever tried?
Ever failed.
No matter.
Try again.
Fail again.
Fail better.
```

| Metric | First process | Second process |
|---|---:|---:|
| Wall time | 7.43 s | 6.75 s |
| User CPU | 30.34 s | 27.37 s |
| System CPU | 3.73 s | 3.21 s |
| Average CPU | 458% | 452% |
| Peak RSS | 812,924 KiB | 812,552 KiB |
| Exit status | 0 | 0 |

There were no warnings or errors. Completed transcript lines are emitted on stderr by the installed CLI design; stdout was empty.

## Resident-model benchmark

The Python benchmark loaded one transcriber and reused it for two fresh streams:

| Metric | Result |
|---|---:|
| Model load | 0.557 s |
| Resident RSS after load | 725,140 KiB |
| First inference | 7.062 s |
| First real-time factor | 0.709 |
| Warm inference | 6.868 s |
| Warm real-time factor | 0.689 |
| Peak process RSS | 821,404 KiB |

The transcriber was explicitly closed after the second pass. Warm inference, rather than full CLI process time, is the relevant production latency measurement.

CPU profiling observed approximately 447–495% process CPU during inference. Work reached all six vCPUs, with roughly 4.5–5 cores consumed on average. This is acceptable for occasional short prompts but unsuitable for unbounded concurrent transcription alongside the existing VPS workload.

## OGG and Opus ingestion

The format path was validated as:

```text
OGG/Opus
    ↓ ffmpeg
mono 16 kHz signed 16-bit PCM WAV
    ↓ Moonshine Medium Streaming
transcript
```

A bundled human speech fixture was technically encoded to OGG/Opus and `.opus`, passed through the harness, and transcribed. Both outputs matched the WAV transcript exactly.

| Input | Inference | Real-time factor |
|---|---:|---:|
| `.ogg` / Opus | 7.500 s | 0.753 |
| `.opus` | 6.126 s | 0.615 |

Temporary encoded fixtures and normalized WAV files were removed. This proves codec compatibility, not accuracy on an actual Telegram-recorded voice note.

## VPS resource safety

Before testing, the VPS had approximately 6.7 GiB available RAM and no swap. With the model held resident, the process used approximately 699 MiB RSS and system available memory remained approximately 6.3 GiB. Peak benchmark RSS was approximately 802 MiB. No swapping, OOM, or production-service failure occurred.

`helix-runtime`, `helix-db`, and `n8n` remained running, and `/v1/health` returned `ok` after validation.

Memory residency is safe with current headroom. CPU is the limiting resource. A future component should:

1. keep one Medium Streaming model resident;
2. allow one active transcription at a time;
3. queue or reject excess work;
4. impose bounded input duration and execution timeout;
5. avoid involving the GPU worker.

No production CPU limit or Docker configuration was changed during validation.

## Helix vocabulary support

Moonshine Voice 0.1.5 exposes these relevant mechanisms on streaming models:

- `Transcriber.set_keyterms([...])` to bias toward explicit terms;
- `Transcriber.set_context(text, max_terms=...)` to derive unusual terms from context;
- the load-time `keyterm_boost` option to control bias strength;
- an English spelling CNN and `MOONSHINE_FLAG_SPELLING_MODE` for explicitly spelled/alphanumeric input.

The installed Medium Streaming model accepted `set_keyterms` and `set_context` calls using Helix vocabulary including Helix, ComfyUI, LTX, T2V, Leibovitz, Seedance, LoRA, and CFG.

Recommended next validation:

- compare unbiased and restrained keyterm-biased recognition on real speech;
- test acronyms and version strings such as LTX 2.5, T2V, T2I, and CFG;
- do not enable spelling mode globally because installed source notes that it can reduce free-form recognition accuracy;
- do not treat API support as proof that domain terms will be recognized correctly.

Optional LoRA/fine-tuning commands exist, but their extra dependencies were not installed and they are not justified before simpler keyterm/context evaluation.

## Remaining gates

Before Telegram integration:

1. Test several actual Telegram voice notes from the intended operator and device.
2. Measure transcription quality on short, noisy, and near-30-second prompts.
3. Evaluate Helix vocabulary with no bias and with a small keyterm list.
4. Decide bounded duration, concurrency, timeout, and failure semantics for a future local speech component.
5. Preserve the existing text command and T2V/T2I pending-state routing as the only downstream interpretation path.

Machine-readable measurements are retained in `test/results/validation-summary.json`.
