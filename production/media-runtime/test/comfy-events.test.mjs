import assert from "node:assert/strict";
import test from "node:test";

import {
  parseComfyExecutionEvent
} from "../dist/adapters/comfy/events.js";

test("Comfy progress event keeps prompt, node, and sampler values", () => {
  const event = parseComfyExecutionEvent(
    JSON.stringify({
      type: "progress",
      data: {
        prompt_id: "prompt-1",
        node: "405:340",
        value: 7,
        max: 21
      }
    })
  );

  assert.deepEqual(event, {
    kind: "progress",
    backendJobId: "prompt-1",
    nodeId: "405:340",
    value: 7,
    max: 21
  });
});

test("Comfy progress_state normalizes all reported node states", () => {
  const event = parseComfyExecutionEvent(
    JSON.stringify({
      type: "progress_state",
      data: {
        prompt_id: "prompt-2",
        nodes: {
          "10": {
            node_id: "10",
            display_node_id: "10",
            parent_node_id: null,
            real_node_id: "10",
            state: "finished",
            value: 1,
            max: 1
          },
          "11": {
            node_id: "11",
            display_node_id: "11",
            parent_node_id: null,
            real_node_id: "11",
            state: "running",
            value: 4,
            max: 20
          }
        }
      }
    })
  );

  assert.equal(event.kind, "progress_state");
  assert.equal(event.backendJobId, "prompt-2");
  assert.equal(event.nodes.length, 2);
  assert.deepEqual(event.nodes[1], {
    nodeId: "11",
    displayNodeId: "11",
    realNodeId: "11",
    parentNodeId: null,
    state: "running",
    value: 4,
    max: 20
  });
});

test("Comfy execution parser ignores malformed and unrelated socket messages", () => {
  assert.equal(
    parseComfyExecutionEvent("not-json"),
    null
  );

  assert.equal(
    parseComfyExecutionEvent(
      JSON.stringify({
        type: "status",
        data: {
          status: {}
        }
      })
    ),
    null
  );
});
