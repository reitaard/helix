import assert from "node:assert/strict";
import test from "node:test";
import { WorkerRegistry } from "../dist/workers/registry.js";

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

test("WorkerRegistry refuses a supplied adapter whose kind differs from backend definition", () => {
  assert.throws(() => new WorkerRegistry([workers[1]], new Map([["facefusion", adapter("comfy")]])), /Adapter kind mismatch/);
});
