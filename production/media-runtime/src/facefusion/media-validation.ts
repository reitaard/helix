import { execFile } from "node:child_process";
import { extname } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const VIDEO_EXTENSIONS = new Set([".mp4", ".mov", ".m4v", ".mkv", ".webm"]);
const IMAGE_FORMATS = new Set(["image2", "jpeg_pipe", "png_pipe", "webp_pipe"]);
const VIDEO_FORMATS = new Set(["mov,mp4,m4a,3gp,3g2,mj2", "matroska,webm"]);

interface ProbeOutput {
  streams?: Array<{ codec_type?: string; width?: number; height?: number }>;
  format?: { duration?: string; format_name?: string };
}

export interface FaceFusionMediaMetadata {
  mediaKind: "image" | "video";
  width: number;
  height: number;
  durationSeconds: number | null;
}

export function validateFaceFusionProbeOutput(parsed: ProbeOutput, filename: string, expectedKind: "image" | "video"): FaceFusionMediaMetadata {
  const extension = extname(filename).toLowerCase();
  if (!(expectedKind === "image" ? IMAGE_EXTENSIONS : VIDEO_EXTENSIONS).has(extension)) {
    throw new Error(`Unsupported FaceFusion ${expectedKind} extension`);
  }
  const stream = parsed.streams?.find(value => value.codec_type === "video");
  if (!stream || !Number.isInteger(stream.width) || stream.width! <= 0 || !Number.isInteger(stream.height) || stream.height! <= 0) {
    throw new Error("FaceFusion media has no valid video/image stream");
  }
  const format = parsed.format?.format_name ?? "";
  if (expectedKind === "image" && !IMAGE_FORMATS.has(format)) throw new Error("FaceFusion source/target is not a decoded supported image");
  if (expectedKind === "video" && !VIDEO_FORMATS.has(format)) throw new Error("FaceFusion target is not a decoded supported video");
  const duration = Number(parsed.format?.duration);
  if (expectedKind === "video" && (!Number.isFinite(duration) || duration <= 0)) throw new Error("FaceFusion target video duration is invalid");
  return { mediaKind: expectedKind, width: stream.width!, height: stream.height!, durationSeconds: expectedKind === "video" ? duration : null };
}

export async function validateFaceFusionMedia(filePath: string, filename: string, expectedKind: "image" | "video"): Promise<FaceFusionMediaMetadata> {
  const { stdout } = await execFileAsync("ffprobe", [
    "-v", "error", "-show_entries", "format=format_name,duration:stream=codec_type,width,height", "-of", "json", filePath
  ], { timeout: 15_000, maxBuffer: 1024 * 1024, windowsHide: true });
  return validateFaceFusionProbeOutput(JSON.parse(stdout) as ProbeOutput, filename, expectedKind);
}
