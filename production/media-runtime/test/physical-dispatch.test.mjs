import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { JobDispatcher } from "../dist/jobs/dispatcher.js";

const migration = await readFile(new URL("../migrations/0015_multi_backend_dispatch_and_telegram_bots.sql", import.meta.url), "utf8");
const repository = await readFile(new URL("../src/repositories/dispatch-repository.ts", import.meta.url), "utf8");
const jobs = await readFile(new URL("../src/repositories/job-repository.ts", import.meta.url), "utf8");

test("physical RTX 4060 resource has capacity one and dispatch claims use PostgreSQL locking", () => {
  assert.match(migration, /helix-gpu-rtx4060-01', 1/);
  assert.match(repository, /FOR UPDATE OF r SKIP LOCKED/);
  assert.match(repository, /dispatch_state IN \('claimed', 'dispatched'\)/);
  assert.match(repository, /ORDER BY created_at, id/);
  assert.match(repository, /dispatch_token = \$2/);
});

test("waiting jobs can be atomically cancelled before backend_job_id exists", () => {
  assert.match(jobs, /status = 'accepted'[\s\S]*dispatch_state = 'pending'[\s\S]*backend_job_id IS NULL/);
  assert.match(jobs, /waitingForResource/);
});

test("dispatcher serializes comfy then FaceFusion when a durable resource claim exposes one slot", async () => {
  const submitted = [];
  let active = false;
  const queue = [
    { jobId: "a", workerId: "comfy", resourceId: "gpu", request: { workflow: {} }, dispatchToken: "one" },
    { jobId: "b", workerId: "facefusion", resourceId: "gpu", request: { workflow: {} }, dispatchToken: "two" }
  ];
  const dispatches = {
    async claimNext() { if (active || queue.length === 0) return null; active = true; return queue.shift(); },
    async markDispatched(input) { submitted.push(input.jobId); },
    async markDispatchFailed() {}
  };
  const workers = { async submit(id) { return { backendJobId: `${id}-backend`, backendResponse: {} }; } };
  const dispatcher = new JobDispatcher(dispatches, workers);
  assert.equal(await dispatcher.dispatchOnce(), true);
  assert.equal(await dispatcher.dispatchOnce(), false);
  assert.deepEqual(submitted, ["a"]);
  active = false;
  assert.equal(await dispatcher.dispatchOnce(), true);
  assert.deepEqual(submitted, ["a", "b"]);
});

test("ambiguous post-submit persistence failure keeps the durable claim instead of releasing it", async () => {
  let failed = 0;
  const dispatches = {
    async claimNext() { return { jobId: "a", workerId: "comfy", resourceId: "gpu", request: { workflow: {} }, dispatchToken: "one" }; },
    async markDispatched() { throw new Error("database unavailable"); },
    async markDispatchFailed() { failed += 1; }
  };
  const dispatcher = new JobDispatcher(dispatches, { async submit() { return { backendJobId: "already-submitted", backendResponse: {} }; } });
  await dispatcher.dispatchOnce();
  assert.equal(failed, 0);
});
