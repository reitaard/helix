import assert from "node:assert/strict";
import test from "node:test";

import {
  ComfyClient
} from "../dist/adapters/comfy/client.js";

test("ComfyClient history requests the capped max_items endpoint", async () => {
  const originalFetch = globalThis.fetch;
  let capturedUrl = null;
  let capturedSignal = null;

  globalThis.fetch = async (url, options) => {
    capturedUrl = String(url);
    capturedSignal = options?.signal ?? null;
    return new Response("{}", {
      status: 200,
      headers: {
        "content-type": "application/json"
      }
    });
  };

  try {
    const client = new ComfyClient("http://comfy.test:8188");
    const history = await client.history(1000);

    assert.deepEqual(history, {});
    assert.equal(
      capturedUrl,
      "http://comfy.test:8188/history?max_items=100"
    );
    assert.ok(capturedSignal instanceof AbortSignal);
  }
  finally {
    globalThis.fetch = originalFetch;
  }
});

test("ComfyClient history preserves transport timeout failures", async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async () => {
    throw new DOMException(
      "The operation was aborted due to timeout",
      "TimeoutError"
    );
  };

  try {
    const client = new ComfyClient("http://comfy.test:8188");

    await assert.rejects(
      client.history(100),
      error => error?.name === "TimeoutError"
    );
  }
  finally {
    globalThis.fetch = originalFetch;
  }
});

test("ComfyClient prompt correlates execution events with one stable client id", async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];

  globalThis.fetch = async (url, options) => {
    requests.push({
      url: String(url),
      body: JSON.parse(String(options?.body ?? "{}"))
    });

    return new Response(
      JSON.stringify({
        prompt_id: `prompt-${requests.length}`,
        number: requests.length,
        node_errors: {}
      }),
      {
        status: 200,
        headers: {
          "content-type": "application/json"
        }
      }
    );
  };

  try {
    const client = new ComfyClient(
      "http://comfy.test:8188",
      "helix-runtime-worker-1"
    );

    await client.prompt({
      "1": {
        class_type: "TestNode",
        inputs: {}
      }
    });

    await client.prompt({
      "2": {
        class_type: "TestNode",
        inputs: {}
      }
    });

    assert.equal(requests.length, 2);

    for (const request of requests) {
      assert.equal(
        request.url,
        "http://comfy.test:8188/prompt"
      );
      assert.equal(
        request.body.client_id,
        "helix-runtime-worker-1"
      );
      assert.deepEqual(
        request.body.extra_data,
        {
          preview_method: "none"
        }
      );
      assert.ok(request.body.prompt);
    }
  }
  finally {
    globalThis.fetch = originalFetch;
  }
});
