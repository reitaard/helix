import assert from "node:assert/strict";
import test from "node:test";
import { renderJobGeneration } from "../dist/telegram/job-generation-presentation.js";
import { faceFusionDeliveringProgressHtml, faceFusionProgressBar, faceFusionQueuedProgressHtml, faceFusionRunningProgressHtml, faceFusionTerminalProgressHtml } from "../dist/telegram/facefusion-progress-presentation.js";
import { TelegramProgressService } from "../dist/telegram/progress-service.js";

const progressJob = (status, error = null) => ({ jobNumber: "123", tool: "face.swap", status, request: {}, error, createdAt: "2026-09-05T00:00:00.000Z", startedAt: "2026-09-05T00:00:00.000Z", finishedAt: null });

test("FaceFusion lifecycle presentation is indeterminate, compact, and free of Comfy semantics", () => {
  const queued = faceFusionQueuedProgressHtml(progressJob("queued"));
  const running = faceFusionRunningProgressHtml(progressJob("running"));
  const complete = faceFusionDeliveringProgressHtml(progressJob("succeeded"));
  const failed = faceFusionTerminalProgressHtml(progressJob("failed", { message: "C:\\secret\\traceback token" }));
  const cancelled = faceFusionTerminalProgressHtml(progressJob("cancelled"));
  assert.match(queued, /\[ QUEUED \]/);
  assert.match(queued, /Waiting for GPU/);
  assert.match(running, /\[ PROCESSING \]/);
  assert.match(running, /Processing  [█░]{10}/);
  assert.match(running, /Running ·/);
  assert.doesNotMatch(running, /%|Workflow|Sampling/);
  assert.notEqual(faceFusionProgressBar(0), faceFusionProgressBar(10));
  assert.match(complete, /██████████/);
  assert.match(complete, /Uploading artifact/);
  assert.match(failed, /\[ FAILED \]/);
  assert.doesNotMatch(failed, /secret/);
  assert.match(cancelled, /\[ CANCELLED \]/);
  assert.doesNotMatch(cancelled, /<blockquote>/);
});

test("FaceFusion lifecycle progress uses its bot and durable private/forum destinations", async () => {
  const edits = [];
  const lifecycle = (jobId, chatId, threadId, status) => ({ jobId, botKey: "facefusion", chatId, threadId, messageId: `m-${jobId}`, presentationState: "active", lastJobStatus: null, jobNumber: jobId, status, workerId: "face-worker", profileId: "faceswap", tool: "face.swap", backendJobId: jobId, request: {}, error: null, createdAt: new Date().toISOString(), startedAt: new Date(Date.now() - 8000).toISOString(), finishedAt: null });
  const lifecycles = { async listActive() { return [lifecycle("123", "42", null, "queued"), lifecycle("124", "-10099", "154", "running")]; }, async markRenderedStatus() {}, async markTerminal() {} };
  const router = {
    get(key) {
      assert.equal(key, "facefusion");
      return { delivery: { async editHtml(messageId, html, destination) { edits.push({ messageId, html, destination }); } } };
    }
  };
  const service = new TelegramProgressService("comfy-worker", { subscribeExecutionEvents() { return null; }, profileDisplayName() { return "ignored"; } }, lifecycles, router, 3000, 10, 15000, 5000);
  await service.syncStatuses();
  assert.deepEqual(edits.map(edit => edit.destination), [{ chatId: "42", threadId: null }, { chatId: "-10099", threadId: "154" }]);
  assert.match(edits[1].html, /\[ PROCESSING \]/);
  assert.doesNotMatch(edits[1].html, /Workflow|Sampling|%/);
});

test("face.swap job detail presents semantic generation metadata", () => {
  const html = renderJobGeneration({ generation: {
    kind: "face.swap", model: "HyperSwap B", targetMediaKind: "video",
    settings: { faceSelectorMode: "reference", referenceFacePosition: 1, weight: 0.5, pixelBoost: "256x256" }
  } }, "worker-job", { artifacts: [{ filename: "result.mp4" }] });
  assert.match(html, /FaceFusion face swap/);
  assert.match(html, /HyperSwap B/);
  assert.match(html, /FaceFusion job/);
  assert.match(html, /result\.mp4/);
  assert.doesNotMatch(html, /Output quality|Comfy Prompt/);
});
