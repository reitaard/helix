import assert from "node:assert/strict";
import test from "node:test";
import {
  FaceFusionHttpError,
  faceFusionWireParsers
} from "../dist/adapters/facefusion/client.js";
import { FaceFusionAdapter } from "../dist/adapters/facefusion/adapter.js";

const SOURCE_ID = "00112233445546778899aabbccddeeff";
const TARGET_ID = "ffeeddccbbaa4988bbaa009988776655";

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function readiness(overrides = {}) {
  return {
    ready: true,
    worker: "helix-facefusion-worker",
    backend: "facefusion",
    profile: "faceswap",
    capabilities: ["face.swap"],
    productionModel: { displayName: "HyperSwap B", facefusionModel: "hyperswap_1b_256" },
    capacity: { maxActiveJobs: 1, activeJobId: null },
    apiAuthConfigured: false,
    checks: {
      facefusionRoot: true,
      facefusionEntry: true,
      facefusionPython: true,
      hyperswapBModel: true,
      inputRoot: true,
      outputRoot: true,
      jobRoot: true
    },
    ...overrides
  };
}

test("FaceFusion adapter maps the exact worker 0.2.0 contract", async () => {
  const original = globalThis.fetch;
  const requests = [];
  let jobReads = 0;
  globalThis.fetch = async (url, init = {}) => {
    requests.push({ url: String(url), init });
    if (String(url).endsWith("/v1/health")) return json({ ok: true, worker: "helix-facefusion-worker", version: "0.2.0" });
    if (String(url).endsWith("/v1/readiness")) return json(readiness());
    if (String(url).endsWith("/v1/jobs") && init.method === "POST") return json({ status: "queued" });
    if (String(url).endsWith("/v1/jobs/job_123")) return ++jobReads === 1
      ? json({ status: "running" })
      : json({ status: "succeeded", artifact: { filename: "result.mp4", mediaKind: "video", sizeBytes: 12345 } });
    if (String(url).endsWith("/v1/jobs/job_cancel/cancel")) return json({ status: "cancelled" });
    throw new Error(`unexpected ${url}`);
  };
  try {
    const adapter = new FaceFusionAdapter("http://100.110.21.79:8791/", "test-token");
    assert.equal((await adapter.liveness()).backendVersion, "0.2.0");
    const ready = await adapter.readiness();
    assert.equal(ready.transportReady, true);
    assert.equal(ready.checks.events, false);
    assert.deepEqual(ready.queue, { running: 0, pending: 0 });

    const submitted = await adapter.submit(
      { sourceInputId: SOURCE_ID, targetInputId: TARGET_ID, settings: {} },
      { jobId: "job_123", dispatchToken: "postgres-claim-not-sent" }
    );
    assert.equal(submitted.backendJobId, "job_123");
    assert.equal((await adapter.status("job_123")).state, "running");
    const complete = await adapter.status("job_123");
    assert.deepEqual(complete.artifacts[0], {
      filename: "result.mp4",
      type: "output",
      artifactId: "job_123",
      mediaKind: "video"
    });
    assert.equal(await adapter.cancel("job_cancel"), true);

    const create = requests.find(request => request.url.endsWith("/v1/jobs"));
    assert.deepEqual(JSON.parse(create.init.body), {
      jobId: "job_123",
      sourceInputId: SOURCE_ID,
      targetInputId: TARGET_ID,
      settings: {}
    });
    const createHeaders = new Headers(create.init.headers);
    assert.equal(createHeaders.get("idempotency-key"), null);
    assert.equal(createHeaders.get("authorization"), "Bearer test-token");
    assert.equal(JSON.stringify(JSON.parse(create.init.body)).includes("model"), false);
  }
  finally { globalThis.fetch = original; }
});

test("FaceFusion wire parsers reject aliases and contract drift", () => {
  assert.throws(() => faceFusionWireParsers.parseHealth({ version: "0.2.0" }), /health ok/);
  assert.throws(() => faceFusionWireParsers.parseReadiness(readiness({ backend: "comfy" })), /readiness backend/);
  assert.throws(() => faceFusionWireParsers.parseJob({ state: "processing" }), /status is invalid/);
  assert.throws(() => faceFusionWireParsers.parseJob({ status: "completed" }), /status is invalid/);
  assert.throws(() => faceFusionWireParsers.parseJob({ status: "succeeded", artifact: { filename: "other.mp4", mediaKind: "video", sizeBytes: 1 } }), /filename/);
});

test("FaceFusion input parser enforces UUID4 hex, role and detected media kind", () => {
  assert.deepEqual(faceFusionWireParsers.parseInput({ id: SOURCE_ID, role: "source", mediaKind: "image", sizeBytes: 10 }, "source"), {
    id: SOURCE_ID, role: "source", mediaKind: "image", sizeBytes: 10
  });
  assert.throws(() => faceFusionWireParsers.parseInput({ id: "../../input.jpg", role: "source", mediaKind: "image", sizeBytes: 10 }, "source"), /UUID4 hex/);
  assert.throws(() => faceFusionWireParsers.parseInput({ id: SOURCE_ID, role: "target", mediaKind: "image", sizeBytes: 10 }, "source"), /role must be source/);
  assert.throws(() => faceFusionWireParsers.parseInput({ id: SOURCE_ID, role: "source", mediaKind: "video", sizeBytes: 10 }, "source"), /source input must be an image/);
});

test("FaceFusion HTTP 409 preserves exact conflict and busy details", () => {
  const conflict = new FaceFusionHttpError("/v1/jobs", 409, "job_id_conflict");
  assert.equal(conflict.status, 409);
  assert.equal(conflict.detail, "job_id_conflict");
  assert.match(conflict.message, /job_id_conflict/);
  const busy = new FaceFusionHttpError("/v1/jobs", 409, { code: "worker_busy", activeJobId: "job_active" });
  assert.deepEqual(busy.detail, { code: "worker_busy", activeJobId: "job_active" });
  assert.match(busy.message, /worker_busy/);
});
