import { FaceFusionHttpError, type FaceFusionErrorCode } from "../adapters/facefusion/client.js";

function errorCode(error: unknown): FaceFusionErrorCode | null {
  if (!(error instanceof FaceFusionHttpError)) return null;
  const detail = error.detail;
  if (!detail || typeof detail !== "object" || Array.isArray(detail)) return null;
  const code = (detail as Record<string, unknown>).code;
  return typeof code === "string" ? code as FaceFusionErrorCode : null;
}

export function faceFusionInputMessage(error: unknown, role: "source" | "target") {
  const code = errorCode(error);
  if (role === "source" && code === "no_source_face_detected") {
    return "No face detected in the source image.\nSend another source image.";
  }
  if (role === "target" && code === "no_target_face_detected") {
    return "No face detected in the target image.\nSend another target image or video.";
  }
  if (code === "face_analysis_failed") {
    return "Could not analyse faces in the image.\nTry another image.";
  }
  return null;
}

export function faceFusionExecutionMessage(code: FaceFusionErrorCode) {
  if (code === "no_source_face_detected") return "No face detected in the source image.";
  if (code === "no_target_face_detected") return "No face detected in the target image.";
  if (code === "face_analysis_failed") return "Face analysis failed.";
  if (code === "output_missing") return "FaceFusion completed without an output artifact.";
  if (code === "worker_restarted") return "FaceFusion worker restarted during execution.";
  return "FaceFusion execution failed";
}

export const faceFusionSemanticErrors = { errorCode };
