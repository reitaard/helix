import assert from "node:assert/strict";
import test from "node:test";

import {
  TelegramProgressService
} from "../dist/telegram/progress-service.js";

function tick() {
  return new Promise(resolve => setImmediate(resolve));
}

test("progress events are coalesced while a Telegram edit is in flight", async () => {
  let listener = null;
  let releaseFirst = null;
  let calls = 0;
  let inFlight = 0;
  let maxInFlight = 0;

  const lifecycle = {
    jobId: "job_57",
    chatId: "-1004369617758",
    messageId: "77",
    presentationState: "active",
    lastJobStatus: "running",
    jobNumber: "57",
    status: "running",
    workerId: "helix-rtx4060-01",
    profileId: "nolan",
    tool: "video.t2v",
    backendJobId: "prompt-57",
    request: {
      workflow: {
        "1": {
          class_type: "SamplerCustomAdvanced",
          inputs: {}
        }
      }
    },
    error: null,
    createdAt: "2026-09-03T09:00:00.000Z",
    startedAt: "2026-09-03T09:00:01.000Z",
    finishedAt: null
  };

  const workers = {
    subscribeExecutionEvents(_workerId, callback) {
      listener = callback;
      return () => {};
    },
    profileDisplayName() {
      return "Christopher Nolan";
    }
  };

  const lifecycles = {
    async findByBackendJobId() {
      return lifecycle;
    },
    async listActive() {
      return [];
    }
  };

  const telegram = {
    async editHtml() {
      calls += 1;
      inFlight += 1;
      maxInFlight = Math.max(
        maxInFlight,
        inFlight
      );

      if (calls === 1) {
        await new Promise(resolve => {
          releaseFirst = resolve;
        });
      }

      inFlight -= 1;
      return { messageId: "77" };
    }
  };

  const service = new TelegramProgressService(
    "helix-rtx4060-01",
    workers,
    lifecycles,
    telegram,
    60_000,
    0,
    60_000,
    0
  );

  service.start();

  listener({
    kind: "execution_start",
    backendJobId: "prompt-57"
  });

  while (calls === 0) {
    await tick();
  }

  listener({
    kind: "progress",
    backendJobId: "prompt-57",
    nodeId: "1",
    value: 50,
    max: 100
  });

  await tick();

  assert.equal(calls, 1);
  assert.equal(maxInFlight, 1);

  releaseFirst();

  for (let i = 0; i < 10 && calls < 2; i += 1) {
    await tick();
  }

  assert.equal(calls, 2);
  assert.equal(maxInFlight, 1);

  service.stop();
});
