#!/usr/bin/env python3
"""Local Moonshine STT validation harness for Helix.

Accepts WAV, OGG, or Opus, normalizes audio with ffmpeg to mono 16 kHz PCM WAV,
loads the pinned Medium Streaming English model, and emits JSON. Use --repeat 2
to measure two transcriptions with one resident model.
"""
from __future__ import annotations

import argparse
import importlib.metadata
import json
from pathlib import Path
import subprocess
import tempfile
import time
import wave

from moonshine_voice import ModelArch, Transcriber, load_wav_file
from moonshine_voice.transcriber import LineCompleted, TranscriptEventListener

MODEL_PATH = Path(
    "/opt/helix-speech/models/download.moonshine.ai/model/medium-streaming-en/quantized_26_08_21"
)
MODEL_ARCH = ModelArch.MEDIUM_STREAMING
MODEL_NAME = "medium-streaming-en"
SUPPORTED_SUFFIXES = {".wav", ".ogg", ".opus"}
REQUIRED_MODEL_FILES = {
    "adapter.ort", "cross_kv.ort", "decoder_kv.ort", "encoder.ort",
    "frontend.model.ort", "frontend.weights.ort", "streaming_config.json",
    "tokenizer.bin",
}


def memory_kib() -> dict[str, int | None]:
    values: dict[str, int | None] = {"resident_rss_kib": None, "peak_rss_kib": None}
    try:
        for line in Path("/proc/self/status").read_text().splitlines():
            if line.startswith("VmRSS:"):
                values["resident_rss_kib"] = int(line.split()[1])
            elif line.startswith("VmHWM:"):
                values["peak_rss_kib"] = int(line.split()[1])
    except (OSError, ValueError, IndexError):
        pass
    return values


def normalize_audio(source: Path, destination: Path) -> None:
    command = [
        "ffmpeg", "-nostdin", "-hide_banner", "-loglevel", "error", "-y",
        "-i", str(source), "-vn", "-ac", "1", "-ar", "16000",
        "-c:a", "pcm_s16le", str(destination),
    ]
    completed = subprocess.run(command, text=True, capture_output=True, check=False)
    if completed.returncode != 0:
        raise RuntimeError(f"ffmpeg conversion failed: {completed.stderr.strip()}")


def wav_duration(path: Path) -> float:
    with wave.open(str(path), "rb") as audio:
        return audio.getnframes() / audio.getframerate()


class Collector(TranscriptEventListener):
    def __init__(self) -> None:
        self.lines: dict[int, str] = {}

    def on_line_completed(self, event: LineCompleted) -> None:
        text = (event.line.text or "").strip()
        if text:
            self.lines[event.line.line_id] = text

    def text(self, final_transcript) -> str:
        if final_transcript is not None:
            for line in final_transcript.lines:
                text = (line.text or "").strip()
                if text:
                    self.lines[line.line_id] = text
        return "\n".join(self.lines[key] for key in sorted(self.lines))


def transcribe_once(transcriber: Transcriber, audio: list[float], sample_rate: int) -> dict:
    collector = Collector()
    started = time.perf_counter()
    with transcriber.create_stream() as stream:
        stream.add_listener(collector)
        stream.start()
        chunk_size = max(1, int(sample_rate * 0.1))
        for offset in range(0, len(audio), chunk_size):
            stream.add_audio(audio[offset : offset + chunk_size], sample_rate)
        final_transcript = stream.stop()
    elapsed = time.perf_counter() - started
    return {"text": collector.text(final_transcript), "transcription_seconds": elapsed, **memory_kib()}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("audio_file", type=Path)
    parser.add_argument("--repeat", type=int, default=1, choices=range(1, 11), metavar="N")
    args = parser.parse_args()
    source = args.audio_file.expanduser().resolve()

    if source.suffix.lower() not in SUPPORTED_SUFFIXES:
        parser.error("audio file must have a .wav, .ogg, or .opus extension")
    if not source.is_file():
        parser.error(f"audio file does not exist: {source}")
    missing = sorted(name for name in REQUIRED_MODEL_FILES if not (MODEL_PATH / name).is_file())
    if missing:
        raise RuntimeError(f"pinned model is incomplete; missing: {', '.join(missing)}")

    total_started = time.perf_counter()
    with tempfile.TemporaryDirectory(prefix="helix-speech-") as temp_dir:
        normalized = Path(temp_dir) / "audio-16khz-mono.wav"
        conversion_started = time.perf_counter()
        normalize_audio(source, normalized)
        conversion_seconds = time.perf_counter() - conversion_started
        duration = wav_duration(normalized)
        audio, sample_rate = load_wav_file(normalized)

        load_started = time.perf_counter()
        transcriber = Transcriber(MODEL_PATH, MODEL_ARCH)
        model_load_seconds = time.perf_counter() - load_started
        memory_after_load = memory_kib()
        try:
            runs = [transcribe_once(transcriber, audio, sample_rate) for _ in range(args.repeat)]
        finally:
            transcriber.close()
        memory_after_release = memory_kib()

    total_seconds = time.perf_counter() - total_started
    primary = runs[0]
    output = {
        "text": primary["text"],
        "audio_duration_seconds": duration,
        "model_load_seconds": model_load_seconds,
        "transcription_seconds": primary["transcription_seconds"],
        "total_seconds": total_seconds,
        "real_time_factor": primary["transcription_seconds"] / duration if duration else None,
        "model": MODEL_NAME,
        "model_arch": MODEL_ARCH.value,
        "model_path": str(MODEL_PATH),
        "moonshine_voice_version": importlib.metadata.version("moonshine-voice"),
        "input_format": source.suffix.lower().lstrip("."),
        "converted_format": "wav/pcm_s16le/16000Hz/mono",
        "conversion_seconds": conversion_seconds,
        "memory_after_model_load": memory_after_load,
        "runs": [
            {**run, "real_time_factor": run["transcription_seconds"] / duration if duration else None}
            for run in runs
        ],
        "transcriber_released": True,
        "memory_after_release": memory_after_release,
    }
    print(json.dumps(output, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
