import {
  execFile
} from "node:child_process";

import {
  stat
} from "node:fs/promises";

import {
  promisify
} from "node:util";

const execFileAsync =
  promisify(execFile);

interface ProbeStream {
  codec_type?: string;
  width?: number;
  height?: number;
}

interface ProbeResult {
  streams?: ProbeStream[];

  format?: {
    duration?: string;
  };
}

export interface MediaInspection {
  width: number | null;
  height: number | null;

  durationSeconds:
    number | null;

  sizeBytes: number;

  audioPresent: boolean;
}

export async function probeMedia(
  filePath: string
): Promise<MediaInspection> {
  const [
    file,
    probe
  ] =
    await Promise.all([
      stat(filePath),

      execFileAsync(
        "ffprobe",
        [
          "-v",
          "error",

          "-show_entries",
          "format=duration:stream=codec_type,width,height",

          "-of",
          "json",

          filePath
        ],
        {
          maxBuffer:
            1024 * 1024
        }
      )
    ]);

  const parsed =
    JSON.parse(
      probe.stdout
    ) as ProbeResult;

  const streams =
    parsed.streams ?? [];

  const video =
    streams.find(
      stream =>
        stream.codec_type ===
        "video"
    );

  const duration =
    Number(
      parsed.format
        ?.duration
    );

  return {
    width:
      typeof video?.width ===
        "number"
        ? video.width
        : null,

    height:
      typeof video?.height ===
        "number"
        ? video.height
        : null,

    durationSeconds:
      Number.isFinite(duration)
        ? duration
        : null,

    sizeBytes:
      file.size,

    audioPresent:
      streams.some(
        stream =>
          stream.codec_type ===
          "audio"
      )
  };
}

export function formatBytes(
  bytes: number
) {
  if (bytes < 1_000_000) {
    return `${(
      bytes / 1000
    ).toFixed(1)} KB`;
  }

  return `${(
    bytes / 1_000_000
  ).toFixed(1)} MB`;
}

export function formatDuration(
  seconds: number | null
) {
  if (seconds === null) {
    return "Unknown";
  }

  return `${seconds.toFixed(1)}s`;
}

export function formatRuntime(
  startedAt: string | null,
  finishedAt: string | null
) {
  if (
    !startedAt ||
    !finishedAt
  ) {
    return "Unknown";
  }

  const elapsed =
    Math.max(
      0,
      new Date(
        finishedAt
      ).getTime() -
      new Date(
        startedAt
      ).getTime()
    );

  const totalSeconds =
    Math.round(
      elapsed / 1000
    );

  const minutes =
    Math.floor(
      totalSeconds / 60
    );

  const seconds =
    totalSeconds % 60;

  if (minutes === 0) {
    return `${seconds}s`;
  }

  return `${minutes}m ${seconds}s`;
}
