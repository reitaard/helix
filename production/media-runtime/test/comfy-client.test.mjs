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
