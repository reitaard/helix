import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Telegram command transport does not attach reply-association metadata", async () => {
  const source = await readFile(
    new URL(
      "../src/telegram/command-service.ts",
      import.meta.url
    ),
    "utf8"
  );

  assert.doesNotMatch(
    source,
    /force_reply|selective|reply_parameters/
  );

  assert.doesNotMatch(
    source,
    /promptInput\s*\?\s*context\.messageId/
  );

  assert.doesNotMatch(
    source,
    /sendHtml\(response,\s*undefined,\s*context\.messageId\)/
  );
});
