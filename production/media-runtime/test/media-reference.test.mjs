import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  JobRepository
} from "../dist/repositories/job-repository.js";
import {
  renderJobGeneration
} from "../dist/telegram/job-generation-presentation.js";

test("numeric Job lookup can represent a Comfy-only media reference", async () => {
  const seen = {};
  const firstSeen = new Date("2026-08-26T06:12:00Z");
  const db = {
    async query(sql, values) {
      seen.sql = String(sql);
      seen.values = values;

      return {
        rows: [{
          id: "comfy_ref_52",
          job_number: "52",
          tool: "comfy.artifact",
          status: "succeeded",
          worker_id: "Comfy UI",
          profile_id: null,
          adapter: "comfy",
          backend_job_id: "161023abcdef",
          idempotency_key: null,
          request: {
            kind: "comfy_artifact",
            referenceNumber: "52"
          },
          result: null,
          error: null,
          created_at: firstSeen,
          updated_at: firstSeen,
          started_at: firstSeen,
          finished_at: firstSeen
        }]
      };
    }
  };

  const repository =
    new JobRepository(db);
  const job =
    await repository.findByJobNumber("52");

  assert.match(seen.sql, /media_references/);
  assert.deepEqual(seen.values, ["52"]);
  assert.equal(job.jobNumber, "52");
  assert.equal(job.backendJobId, "161023abcdef");
  assert.equal(job.workerId, "Comfy UI");
  assert.equal(job.tool, "comfy.artifact");
});

test("external Comfy references render the same numeric download commands", () => {
  const html = renderJobGeneration(
    {
      kind: "comfy_artifact",
      referenceNumber: "52"
    },
    "161023abcdef",
    null
  );

  assert.ok(html);
  assert.match(html, /external artifact/);
  assert.match(html, /Comfy UI/);
  assert.match(html, /161023abcdef/);
  assert.match(html, /\/dl i 52/);
  assert.match(html, /\/dl g 52/);
});

test("media reference migration shares the Job sequence and reserves Job numbers", async () => {
  const sql = await readFile(
    new URL(
      "../migrations/0012_media_references.sql",
      import.meta.url
    ),
    "utf8"
  );

  assert.match(
    sql,
    /DEFAULT nextval\('media_jobs_job_number_seq'\)/
  );
  assert.match(
    sql,
    /INSERT INTO media_references[\s\S]*SELECT[\s\S]*job_number[\s\S]*FROM media_jobs/
  );
  assert.match(
    sql,
    /AFTER INSERT ON media_jobs/
  );
});
