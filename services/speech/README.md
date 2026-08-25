# Helix Speech

Helix Speech is the project-owned foundation for local speech processing. Its production installation is intentionally separate from the Helix repository:

```text
/opt/helix-speech/
├── .venv/
├── models/
└── test/
```

The current validated stack is Moonshine Voice 0.1.5 with the Medium Streaming English model on the Helix VPS CPU. This directory contains the source-controlled validation harness and evidence; it does not yet contain a daemon, HTTP endpoint, container, or Telegram integration.

Future Telegram voice support should transcribe audio into text and then hand that text to the existing media-runtime command and T2V/T2I pending-state routing. Speech must not create an independent command interpretation or workflow-mutation path.

## Validated runtime

```text
Package:      moonshine-voice 0.1.5
Model:        medium-streaming-en
Architecture: 5 / MEDIUM_STREAMING
Installed:    /opt/helix-speech
Model path:   /opt/helix-speech/models/download.moonshine.ai/model/medium-streaming-en/quantized_26_08_21
Execution:    local VPS CPU only
```

The Windows RTX 4060 production worker is not involved in speech transcription.

## Validation harness

The project-owned harness is:

```text
services/speech/test/transcribe.py
```

The deployed copy is:

```text
/opt/helix-speech/test/transcribe.py
```

Usage on the VPS:

```bash
cd /opt/helix-speech
source .venv/bin/activate
python test/transcribe.py path/to/audio.wav
python test/transcribe.py path/to/voice.ogg
python test/transcribe.py path/to/voice.opus
python test/transcribe.py --repeat 2 path/to/audio.wav
```

It pins model architecture 5 and the installed model path. WAV, OGG, and Opus inputs are normalized with ffmpeg to mono 16 kHz signed 16-bit PCM WAV in an automatically removed temporary directory. Output is JSON and includes transcript, audio duration, model-load time, transcription time, total time, real-time factor, model identity, input/converted formats, and process memory.

See [`MOONSHINE_VALIDATION.md`](MOONSHINE_VALIDATION.md) for measured findings and production suitability. The consolidated machine-readable result is [`test/results/validation-summary.json`](test/results/validation-summary.json).
