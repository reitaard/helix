import assert from "node:assert/strict";
import test from "node:test";
import { WorkerRegistry } from "../dist/workers/registry.js";
import { JobService } from "../dist/jobs/service.js";

function adapter(kind) {
  return {
    kind,
    async liveness() { return { adapter: kind, reachable: true, latencyMs: 1 }; },
    async readiness() { return { adapter: kind, transportReady: true, checks: { runtime: true, queue: true, capabilities: true, events: kind === "comfy" }, latencyMs: 1, errors: [] }; },
    async submit(_workflow, context) { return { backendJobId: `${kind}-job`, backendResponse: { context } }; },
    async status() { return { state: "queued", artifacts: [] }; },
    async cancel() { return true; },
    async downloadArtifact() {},
    subscribeExecutionEvents() { return kind === "comfy" ? () => {} : null; }
  };
}
const resourceId = "helix-gpu-rtx4060-01";
const workers = [
  { id: "comfy", name: "Comfy", revision: "1234567", adapter: "comfy", endpoint: "http://comfy", resourceId, productionProfiles: [{ id: "nolan", displayName: "Nolan", capabilities: ["video.t2v"], modelFamilies: {} }], maxConcurrentGpuJobs: 1 },
  { id: "facefusion", name: "FaceFusion", revision: "pending", adapter: "facefusion", endpoint: "http://facefusion", resourceId, productionProfiles: [{ id: "faceswap", displayName: "FaceFusion", capabilities: ["face.swap"], modelFamilies: {} }], maxConcurrentGpuJobs: 1 }
];

test("WorkerRegistry stores actual comfy and facefusion MediaAdapter instances", async () => {
  const registry = new WorkerRegistry(workers, new Map([["comfy", adapter("comfy")], ["facefusion", adapter("facefusion")]]));
  assert.equal(registry.get("comfy").resourceId, resourceId);
  assert.equal(registry.get("facefusion").runtime, "facefusion");
  assert.equal(registry.resolveProfile("facefusion", "face.swap", "faceswap").kind, "resolved");
  assert.deepEqual((await registry.submit("facefusion", {}, { jobId: "job-1", dispatchToken: "claim-1" })).backendResponse.context, { jobId: "job-1", dispatchToken: "claim-1" });
  assert.equal(registry.subscribeExecutionEvents("facefusion", () => {}), null);
});

test("legacy Comfy ID is canonical across registry and job creation", async () => {
  const canonical = "helix-comfy-rtx4060-01";
  const registry = new WorkerRegistry([{ ...workers[0], id: canonical }], new Map([[canonical, adapter("comfy")]]));
  assert.equal(registry.get("helix-rtx4060-01").id, canonical);
  assert.equal(registry.getDefinition("helix-rtx4060-01").id, canonical);
  assert.equal(registry.getAdapter("helix-rtx4060-01").kind, "comfy");
  assert.equal(registry.resolveProfile("helix-rtx4060-01", "video.t2v", "nolan").kind, "resolved");
  assert.equal(registry.getProfile("helix-rtx4060-01", "nolan").id, "nolan");
  assert.equal(registry.profileSupportsTool("helix-rtx4060-01", "nolan", "video.t2v"), true);
  assert.equal((await registry.readiness("helix-rtx4060-01")).state, "cold_ready");
  const created = [];
  const service = new JobService({ async findByIdempotencyKey() { return null; }, async createAccepted(value) { created.push(value); }, async get(id) { return { id, workerId: created[0].workerId }; } }, registry, { async listForJob() { return []; } });
  const job = await service.create({ tool: "video.t2v", workerId: "helix-rtx4060-01", profileId: "nolan", workflow: {}, inputs: {}, idempotencyKey: null });
  assert.equal(job.workerId, canonical);
  assert.equal(created[0].workerId, canonical);
  assert.equal(created[0].request.workerId, canonical);
});

test("WorkerRegistry marks FaceFusion auth-disabled readiness as degraded", async () => {
  const registry = new WorkerRegistry([workers[1]], new Map([["facefusion", { ...adapter("facefusion"), async readiness() { return { adapter: "facefusion", transportReady: false, checks: { runtime: false, queue: false, capabilities: false, events: false }, latencyMs: 1, errors: ["FaceFusion worker API authentication is not configured"] }; } }]]));
  const ready = await registry.readiness("facefusion");
  assert.equal(ready.state, "degraded");
  assert.doesNotMatch(ready.errors.join("\n"), /token/i);
});

test("WorkerRegistry refuses a supplied adapter whose kind differs from backend definition", () => {
  assert.throws(() => new WorkerRegistry([workers[1]], new Map([["facefusion", adapter("comfy")]])), /Adapter kind mismatch/);
});
