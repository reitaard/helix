import assert from "node:assert/strict";
import test from "node:test";

import {
  resolveJobReference
} from "../dist/telegram/job-reference.js";

function job(jobNumber, id = `job_${jobNumber.padStart(32, "0")}`) {
  return {
    id,
    jobNumber,
    tool: "image.t2i",
    status: "succeeded",
    workerId: "helix-rtx4060-01",
    profileId: "leibovitz",
    adapter: "comfy",
    backendJobId: "prompt-id",
    idempotencyKey: null,
    request: {},
    result: {},
    error: null,
    createdAt: "2026-08-26T00:00:00.000Z",
    updatedAt: "2026-08-26T00:00:00.000Z",
    startedAt: null,
    finishedAt: null
  };
}

function repository({ byNumber = null, byPrefix = [] } = {}) {
  const calls = [];

  return {
    calls,
    async findByJobNumber(value) {
      calls.push(["number", value]);
      return byNumber;
    },
    async findByPrefix(value) {
      calls.push(["prefix", value]);
      return byPrefix;
    }
  };
}

test("job reference resolves an exact numeric Job number", async () => {
  const expected = job("51");
  const jobs = repository({ byNumber: expected });

  const resolved = await resolveJobReference(jobs, "0051");

  assert.equal(resolved.kind, "found");
  assert.equal(resolved.job, expected);
  assert.deepEqual(jobs.calls, [["number", "51"]]);
});

test("job reference reports a missing numeric Job number", async () => {
  const jobs = repository();

  const resolved = await resolveJobReference(jobs, "999");

  assert.equal(resolved.kind, "not_found");
  assert.deepEqual(jobs.calls, [["number", "999"]]);
});

test("job reference preserves legacy UUID prefix compatibility", async () => {
  const expected = job("51", "job_45d337abcdef");
  const jobs = repository({ byPrefix: [expected] });

  const resolved = await resolveJobReference(jobs, "job_45d337...");

  assert.equal(resolved.kind, "found");
  assert.equal(resolved.job, expected);
  assert.deepEqual(jobs.calls, [["prefix", "job_45d337"]]);
});

test("job reference preserves legacy ambiguity handling", async () => {
  const jobs = repository({
    byPrefix: [job("51"), job("52")]
  });

  const resolved = await resolveJobReference(jobs, "abcd");

  assert.equal(resolved.kind, "ambiguous");
});

test("job reference rejects zero and values beyond BIGINT", async () => {
  const jobs = repository();

  assert.equal(
    (await resolveJobReference(jobs, "0")).kind,
    "invalid"
  );
  assert.equal(
    (
      await resolveJobReference(
        jobs,
        "9223372036854775808"
      )
    ).kind,
    "invalid"
  );
  assert.deepEqual(jobs.calls, []);
});
