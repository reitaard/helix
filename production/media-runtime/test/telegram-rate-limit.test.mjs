import assert from "node:assert/strict";
import test from "node:test";

import {
  telegramRetryAfterSeconds,
  telegramRetryDelayMs
} from "../dist/telegram/rate-limit.js";

test("Telegram retry_after is read from Bot API parameters", () => {
  const body = {
    ok: false,
    error_code: 429,
    description: "Too Many Requests: retry after 36",
    parameters: {
      retry_after: 36
    }
  };

  assert.equal(
    telegramRetryAfterSeconds(body),
    36
  );

  assert.equal(
    telegramRetryDelayMs(body),
    37_000
  );
});

test("Telegram retry_after falls back to the description", () => {
  assert.equal(
    telegramRetryAfterSeconds(
      new Error(
        "sendMessage failed: Too Many Requests: retry after 41"
      )
    ),
    41
  );
});

test("ordinary Telegram errors are not treated as rate limits", () => {
  assert.equal(
    telegramRetryAfterSeconds({
      ok: false,
      description: "Bad Request: message is not modified"
    }),
    null
  );
});
