import { createWriteStream, openAsBlob } from "node:fs";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";

export const FACEFUSION_WORKER_NAME = "helix-facefusion-worker";
export const FACEFUSION_WORKER_VERSION = "0.2.0";
export const FACEFUSION_BACKEND = "facefusion";
export const FACEFUSION_PROFILE = "faceswap";
export const FACEFUSION_TOOL = "face.swap";
export const FACEFUSION_MODEL_DISPLAY_NAME = "HyperSwap B";
export const FACEFUSION_MODEL_ID = "hyperswap_1b_256";

export type FaceFusionInputRole = "source" | "target";
export type FaceFusionMediaKind = "image" | "video";
export type FaceFusionJobStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled";

export interface FaceFusionHealthResponse {
  ok: true;
  worker: typeof FACEFUSION_WORKER_NAME;
  version: typeof FACEFUSION_WORKER_VERSION;
}

export interface FaceFusionReadinessResponse {
  ready: boolean;
  worker: typeof FACEFUSION_WORKER_NAME;
  backend: typeof FACEFUSION_BACKEND;
  profile: typeof FACEFUSION_PROFILE;
  capabilities: [typeof FACEFUSION_TOOL];
  productionModel: {
    displayName: typeof FACEFUSION_MODEL_DISPLAY_NAME;
    facefusionModel: typeof FACEFUSION_MODEL_ID;
  };
  capacity: { maxActiveJobs: 1; activeJobId: string | null };
  apiAuthConfigured: boolean;
  checks: {
    facefusionRoot: boolean;
    facefusionEntry: boolean;
    facefusionPython: boolean;
    hyperswapBModel: boolean;
    inputRoot: boolean;
    outputRoot: boolean;
    jobRoot: boolean;
  };
}

export interface FaceFusionInputResponse {
  id: string;
  role: FaceFusionInputRole;
  mediaKind: FaceFusionMediaKind;
  sizeBytes: number;
}

export interface FaceFusionArtifactMetadata {
  filename: "result.mp4" | "result.png";
  mediaKind: FaceFusionMediaKind;
  sizeBytes: number;
}

export interface FaceFusionJobResponse {
  status: FaceFusionJobStatus;
  artifact?: FaceFusionArtifactMetadata;
}

export interface FaceFusionJobRequest {
  jobId: string;
  sourceInputId: string;
  targetInputId: string;
  settings: Record<string, unknown>;
}

export interface FaceFusionHttpResponse<T> {
  status: number;
  body: T;
}

export class FaceFusionHttpError extends Error {
  constructor(
    operation: string,
    readonly status: number,
    readonly detail: unknown
  ) {
    const rendered = typeof detail === "string"
      ? detail
      : detail && typeof detail === "object" && !Array.isArray(detail) && typeof (detail as Record<string, unknown>).code === "string"
        ? (detail as Record<string, unknown>).code as string
        : `HTTP ${status}`;
    super(`FaceFusion ${operation} failed: ${rendered}`);
    this.name = "FaceFusionHttpError";
  }
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`FaceFusion ${label} response is not an object`);
  return value as Record<string, unknown>;
}

function exactString(value: unknown, expected: string, label: string): asserts value is string {
  if (value !== expected) throw new Error(`FaceFusion ${label} must be ${JSON.stringify(expected)}`);
}

function boolean(value: unknown, label: string): asserts value is boolean {
  if (typeof value !== "boolean") throw new Error(`FaceFusion ${label} must be boolean`);
}

function nonnegativeInteger(value: unknown, label: string): asserts value is number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) throw new Error(`FaceFusion ${label} must be a non-negative integer`);
}

function parseHealth(value: unknown): FaceFusionHealthResponse {
  const body = object(value, "health");
  if (body.ok !== true) throw new Error("FaceFusion health ok must be true");
  exactString(body.worker, FACEFUSION_WORKER_NAME, "health worker");
  exactString(body.version, FACEFUSION_WORKER_VERSION, "health version");
  return body as unknown as FaceFusionHealthResponse;
}

function parseReadiness(value: unknown): FaceFusionReadinessResponse {
  const body = object(value, "readiness");
  boolean(body.ready, "readiness ready");
  exactString(body.worker, FACEFUSION_WORKER_NAME, "readiness worker");
  exactString(body.backend, FACEFUSION_BACKEND, "readiness backend");
  exactString(body.profile, FACEFUSION_PROFILE, "readiness profile");
  if (!Array.isArray(body.capabilities) || body.capabilities.length !== 1 || body.capabilities[0] !== FACEFUSION_TOOL) {
    throw new Error("FaceFusion readiness capabilities must be exactly [\"face.swap\"]");
  }
  const model = object(body.productionModel, "readiness productionModel");
  exactString(model.displayName, FACEFUSION_MODEL_DISPLAY_NAME, "production model displayName");
  exactString(model.facefusionModel, FACEFUSION_MODEL_ID, "production model facefusionModel");
  const capacity = object(body.capacity, "readiness capacity");
  if (capacity.maxActiveJobs !== 1) throw new Error("FaceFusion readiness maxActiveJobs must be 1");
  if (capacity.activeJobId !== null && typeof capacity.activeJobId !== "string") throw new Error("FaceFusion readiness activeJobId must be null or string");
  boolean(body.apiAuthConfigured, "readiness apiAuthConfigured");
  const checks = object(body.checks, "readiness checks");
  for (const key of ["facefusionRoot", "facefusionEntry", "facefusionPython", "hyperswapBModel", "inputRoot", "outputRoot", "jobRoot"] as const) {
    boolean(checks[key], `readiness checks.${key}`);
  }
  return body as unknown as FaceFusionReadinessResponse;
}

const UUID4_HEX = /^[0-9a-f]{12}4[0-9a-f]{3}[89ab][0-9a-f]{15}$/i;

function parseInput(value: unknown, expectedRole: FaceFusionInputRole): FaceFusionInputResponse {
  const body = object(value, "input");
  if (typeof body.id !== "string" || !UUID4_HEX.test(body.id)) throw new Error("FaceFusion input id must be 32-character UUID4 hex");
  if (body.role !== expectedRole) throw new Error(`FaceFusion input role must be ${expectedRole}`);
  if (body.mediaKind !== "image" && body.mediaKind !== "video") throw new Error("FaceFusion input mediaKind must be image or video");
  if (expectedRole === "source" && body.mediaKind !== "image") throw new Error("FaceFusion source input must be an image");
  nonnegativeInteger(body.sizeBytes, "input sizeBytes");
  return body as unknown as FaceFusionInputResponse;
}

function parseArtifact(value: unknown): FaceFusionArtifactMetadata {
  const body = object(value, "job artifact");
  if (body.mediaKind !== "image" && body.mediaKind !== "video") throw new Error("FaceFusion artifact mediaKind must be image or video");
  const expectedFilename = body.mediaKind === "video" ? "result.mp4" : "result.png";
  if (body.filename !== expectedFilename) throw new Error(`FaceFusion ${body.mediaKind} artifact filename must be ${expectedFilename}`);
  nonnegativeInteger(body.sizeBytes, "artifact sizeBytes");
  return body as unknown as FaceFusionArtifactMetadata;
}

function parseJob(value: unknown): FaceFusionJobResponse {
  const body = object(value, "job");
  if (!["queued", "running", "succeeded", "failed", "cancelled"].includes(String(body.status))) {
    throw new Error("FaceFusion job status is invalid");
  }
  if (body.status === "succeeded") {
    return { status: "succeeded", artifact: parseArtifact(body.artifact) };
  }
  if (body.artifact !== undefined && body.artifact !== null) throw new Error("FaceFusion non-successful job must not expose an artifact");
  return { status: body.status as Exclude<FaceFusionJobStatus, "succeeded"> };
}

/** Exact transport boundary for helix-facefusion-worker 0.2.0. */
export class FaceFusionClient {
  private readonly baseUrl: string;

  constructor(endpoint: string, private readonly bearerToken?: string, private readonly timeoutMs = 30_000) {
    this.baseUrl = endpoint.replace(/\/$/, "");
  }

  private headers(headers?: HeadersInit) {
    const result = new Headers(headers);
    if (this.bearerToken) result.set("authorization", `Bearer ${this.bearerToken}`);
    return result;
  }

  private async request(path: string, init: RequestInit = {}, timeoutMs = this.timeoutMs): Promise<FaceFusionHttpResponse<unknown>> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: this.headers(init.headers),
      signal: AbortSignal.timeout(timeoutMs)
    });
    const contentType = response.headers.get("content-type") ?? "";
    const body = contentType.includes("json") ? await response.json() : await response.text();
    if (!response.ok) {
      const envelope = body && typeof body === "object" && !Array.isArray(body) ? body as Record<string, unknown> : null;
      throw new FaceFusionHttpError(path, response.status, envelope?.detail ?? body);
    }
    return { status: response.status, body };
  }

  async health() {
    const response = await this.request("/v1/health");
    return { ...response, body: parseHealth(response.body) };
  }

  async readiness() {
    const response = await this.request("/v1/readiness");
    return { ...response, body: parseReadiness(response.body) };
  }

  async uploadInput(filePath: string, filename: string, role: FaceFusionInputRole) {
    const form = new FormData();
    form.set("role", role);
    form.set("file", await openAsBlob(filePath), filename);
    const response = await this.request("/v1/inputs", { method: "POST", body: form }, 10 * 60 * 1000);
    return { ...response, body: parseInput(response.body, role) };
  }

  deleteInput(inputId: string) {
    return this.request(`/v1/inputs/${encodeURIComponent(inputId)}`, { method: "DELETE" });
  }

  async createJob(request: FaceFusionJobRequest) {
    const response = await this.request("/v1/jobs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request)
    });
    return { ...response, body: parseJob(response.body) };
  }

  async job(jobId: string) {
    const response = await this.request(`/v1/jobs/${encodeURIComponent(jobId)}`);
    return { ...response, body: parseJob(response.body) };
  }

  async cancelJob(jobId: string) {
    const response = await this.request(`/v1/jobs/${encodeURIComponent(jobId)}/cancel`, { method: "POST" });
    return { ...response, body: parseJob(response.body) };
  }

  async downloadArtifact(jobId: string, mediaKind: FaceFusionMediaKind, destinationPath: string) {
    const response = await fetch(`${this.baseUrl}/v1/jobs/${encodeURIComponent(jobId)}/artifact`, {
      headers: this.headers(),
      signal: AbortSignal.timeout(10 * 60 * 1000)
    });
    if (!response.ok || !response.body) {
      let detail: unknown = `HTTP ${response.status}`;
      try {
        const body = await response.json() as { detail?: unknown };
        detail = body.detail ?? detail;
      }
      catch {}
      throw new FaceFusionHttpError("artifact", response.status, detail);
    }
    const expectedContentType = mediaKind === "video" ? "video/mp4" : "image/png";
    if (((response.headers.get("content-type") ?? "").split(";", 1)[0] ?? "").trim().toLowerCase() !== expectedContentType) {
      throw new Error(`FaceFusion artifact Content-Type must be ${expectedContentType}`);
    }
    await pipeline(Readable.fromWeb(response.body as import("node:stream/web").ReadableStream), createWriteStream(destinationPath, { flags: "wx" }));
  }
}

export const faceFusionWireParsers = { parseHealth, parseReadiness, parseInput, parseJob };
