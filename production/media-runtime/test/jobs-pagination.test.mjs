import assert from "node:assert/strict";
import test from "node:test";

import {
  TelegramCommandService
} from "../dist/telegram/command-service.js";

function fixture(number) {
  return {
    id: `job_${number}`,
    jobNumber: String(number),
    tool: "image.t2i",
    status: "succeeded",
    workerId: "helix-rtx4060-01",
    profileId: "leibovitz",
    adapter: "comfy",
    backendJobId: `prompt-${number}`,
    idempotencyKey: null,
    request: {},
    result: {},
    error: null,
    createdAt: "2026-08-26T00:00:00.000Z",
    updatedAt: "2026-08-26T00:00:01.000Z",
    startedAt: "2026-08-26T00:00:00.000Z",
    finishedAt: "2026-08-26T00:00:01.000Z"
  };
}

function serviceWith(count) {
  const jobs = Array.from(
    { length: count },
    (_, index) => fixture(count - index)
  );
  const calls = [];
  const repository = {
    async count() {
      return jobs.length;
    },
    async listRecent(limit, offset) {
      calls.push({ limit, offset });
      return jobs.slice(offset, offset + limit);
    }
  };
  const workers = {
    profileDisplayName() {
      return "Annie Leibovitz";
    }
  };
  const service = new TelegramCommandService(
    "token",
    "chat",
    "helix-rtx4060-01",
    null,
    null,
    workers,
    repository,
    null,
    null,
    null,
    null,
    null,
    null,
    null
  );

  return { service, calls };
}

function blockquoteCount(html) {
  return (html.match(/<blockquote>/g) ?? []).length;
}

test("Jobs paginates 20 items with compact navigation", async () => {
  const { service, calls } = serviceWith(45);

  const first = await service.jobsHtml(1);
  const second = await service.jobsHtml(2);
  const third = await service.jobsHtml(3);

  assert.equal(blockquoteCount(first), 20);
  assert.equal(blockquoteCount(second), 20);
  assert.equal(blockquoteCount(third), 5);
  assert.match(first, /<b>Page<\/b> · <b>1\/3<\/b> · <b>20<\/b> <i>shown<\/i>/);
  assert.match(first, /<i>Next<\/i> · <code>\/j p 2<\/code>/);
  assert.match(second, /<i>Prev<\/i> · <code>\/j p 1<\/code> · <i>Next<\/i> · <code>\/j p 3<\/code>/);
  assert.match(third, /<b>Page<\/b> · <b>3\/3<\/b> · <b>5<\/b> <i>shown<\/i>/);
  assert.match(third, /<i>Prev<\/i> · <code>\/j p 2<\/code>/);
  assert.deepEqual(calls, [
    { limit: 20, offset: 0 },
    { limit: 20, offset: 20 },
    { limit: 20, offset: 40 }
  ]);
  assert.doesNotMatch(first, /\n\n/);
  assert.doesNotMatch(second, /\n\n/);
  assert.doesNotMatch(third, /\n\n/);
});

test("Jobs page command validates and rejects missing pages", async () => {
  const { service } = serviceWith(21);

  assert.match(
    await service.handleJobs(["p", "2"]),
    /<b>Page<\/b> · <b>2\/2<\/b>/
  );
  assert.match(
    await service.handleJobs(["p", "0"]),
    /Page must be a positive integer/
  );
  assert.match(
    await service.handleJobs(["p", "3"]),
    /Page not found/
  );
});
