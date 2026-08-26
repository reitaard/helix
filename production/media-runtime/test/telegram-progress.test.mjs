import assert from "node:assert/strict";
import test from "node:test";

import {
  nodeStageLabel,
  runningProgressHtml,
  workflowNodeCount,
  workflowProgressPercent
} from "../dist/telegram/progress-presentation.js";

const request = {
  workflow: {
    "1": {
      class_type: "LoadDiffusionModel",
      inputs: {}
    },
    "2": {
      class_type: "SamplerCustomAdvanced",
      _meta: {
        title: "SamplerCustomAdvanced"
      },
      inputs: {}
    },
    "3": {
      class_type: "VAEDecode",
      inputs: {}
    },
    "4": {
      class_type: "SaveVideo",
      inputs: {}
    }
  }
};

const job = {
  jobNumber: "57",
  status: "running",
  request,
  error: null,
  createdAt: "2026-08-26T08:00:00.000Z",
  startedAt: "2026-08-26T08:00:00.000Z",
  finishedAt: null
};

test("workflow progress uses the submitted API workflow node count", () => {
  assert.equal(
    workflowNodeCount(request),
    4
  );
});

test("workflow progress ignores expanded internal nodes outside the submitted workflow", () => {
  assert.equal(
    workflowProgressPercent(
      request,
      [
        {
          nodeId: "1",
          displayNodeId: "1",
          state: "finished"
        },
        {
          nodeId: "2:internal:7",
          displayNodeId: "2",
          state: "finished"
        },
        {
          nodeId: "2:internal:8",
          displayNodeId: "2",
          state: "finished"
        },
        {
          nodeId: "not-submitted",
          displayNodeId: null,
          state: "finished"
        }
      ]
    ),
    50
  );
});

test("sampler nodes use a stable human stage label", () => {
  assert.equal(
    nodeStageLabel(
      request,
      "2"
    ),
    "Sampling"
  );
});

test("dual loader renders workflow and active-node percentages separately", () => {
  const html = runningProgressHtml(
    job,
    "Christopher Nolan",
    {
      workflowPercent: 50,
      nodePercent: 25,
      stage: "Sampling"
    }
  );

  assert.match(html, /GENERATING/);
  assert.match(html, /Job<\/b> · <code>57<\/code>/);
  assert.match(html, /Workflow/);
  assert.match(html, /50%/);
  assert.match(html, /Sampling/);
  assert.match(html, /25%/);
});
