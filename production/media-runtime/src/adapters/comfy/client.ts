import crypto from "node:crypto";

import {
  createWriteStream
} from "node:fs";

import {
  mkdir
} from "node:fs/promises";

import {
  dirname
} from "node:path";

import {
  Readable
} from "node:stream";

import {
  pipeline
} from "node:stream/promises";

import WebSocket from "ws";

export interface ComfySystemStats {
  system?: {
    comfyui_version?: string;
    python_version?: string;
    pytorch_version?: string;

    ram_total?: number;
    ram_free?: number;
  };

  devices?: unknown[];
}

export interface ComfyQueue {
  queue_running?: unknown[];
  queue_pending?: unknown[];
}

export type ComfyObjectInfo =
  Record<string, unknown>;

export type ComfyHistory =
  Record<string, unknown>;

export interface ComfyPromptResponse {
  prompt_id?: string;
  number?: number;

  node_errors?:
    Record<string, unknown>;

  error?: unknown;
}

export class ComfyClient {
  constructor(
    private readonly baseUrl: string
  ) {}

  private async getJson<T>(
    path: string,
    timeoutMs = 5000
  ): Promise<T> {
    const response =
      await fetch(
        `${this.baseUrl}${path}`,
        {
          signal:
            AbortSignal.timeout(
              timeoutMs
            )
        }
      );

    if (!response.ok) {
      const body =
        await response.text();

      throw new Error(
        `${path} returned HTTP ` +
        `${response.status}: ` +
        body.slice(0, 2000)
      );
    }

    return response.json() as Promise<T>;
  }

  private async postJson<T>(
    path: string,
    body: unknown,
    timeoutMs = 10000
  ): Promise<T> {
    const response =
      await fetch(
        `${this.baseUrl}${path}`,
        {
          method: "POST",

          headers: {
            "content-type":
              "application/json"
          },

          body:
            JSON.stringify(body),

          signal:
            AbortSignal.timeout(
              timeoutMs
            )
        }
      );

    if (!response.ok) {
      const responseBody =
        await response.text();

      throw new Error(
        `${path} returned HTTP ` +
        `${response.status}: ` +
        responseBody.slice(
          0,
          2000
        )
      );
    }

    return response.json() as Promise<T>;
  }

  systemStats() {
    return this.getJson<
      ComfySystemStats
    >(
      "/system_stats"
    );
  }

  queue() {
    return this.getJson<
      ComfyQueue
    >(
      "/queue"
    );
  }

  history() {
    return this.getJson<
      ComfyHistory
    >(
      "/history"
    );
  }

  historyByPrompt(
    promptId: string
  ) {
    return this.getJson<
      ComfyHistory
    >(
      `/history/${
        encodeURIComponent(
          promptId
        )
      }`
    );
  }

  objectInfo() {
    return this.getJson<
      ComfyObjectInfo
    >(
      "/object_info",
      10000
    );
  }

  async downloadArtifact(
    artifact: {
      filename: string;
      subfolder: string;
      type: string;
    },

    destinationPath:
      string
  ) {
    const params =
      new URLSearchParams({
        filename:
          artifact.filename,

        subfolder:
          artifact.subfolder,

        type:
          artifact.type
      });

    const response =
      await fetch(
        `${this.baseUrl}/view?${params}`,
        {
          signal:
            AbortSignal.timeout(
              5 * 60 * 1000
            )
        }
      );

    if (!response.ok) {
      const body =
        await response.text();

      throw new Error(
        `/view returned HTTP ` +
        `${response.status}: ` +
        body.slice(0, 1000)
      );
    }

    if (!response.body) {
      throw new Error(
        "/view returned no body"
      );
    }

    await mkdir(
      dirname(
        destinationPath
      ),
      {
        recursive: true,
        mode: 0o700
      }
    );

    await pipeline(
      Readable.fromWeb(
        response.body as unknown as
          import("node:stream/web")
            .ReadableStream<Uint8Array>
      ),

      createWriteStream(
        destinationPath,
        {
          mode: 0o600
        }
      )
    );
  }

  prompt(
    workflow:
      Record<string, unknown>
  ) {
    return this.postJson<
      ComfyPromptResponse
    >(
      "/prompt",
      {
        prompt: workflow
      }
    );
  }

  async cancelPrompt(
    promptId: string
  ): Promise<boolean> {
    const response =
      await this.postJson<{
        cancelled?: boolean;
      }>(
        `/api/jobs/${
          encodeURIComponent(
            promptId
          )
        }/cancel`,
        {}
      );

    if (
      typeof response.cancelled !==
      "boolean"
    ) {
      throw new Error(
        "Comfy cancel endpoint returned invalid response"
      );
    }

    return response.cancelled;
  }

  statusSocket(
    timeoutMs = 5000
  ): Promise<unknown> {
    const clientId =
      `helix-runtime-${crypto
        .randomUUID()
        .replaceAll("-", "")}`;

    const websocketBase =
      this.baseUrl
        .replace(
          /^http:/,
          "ws:"
        )
        .replace(
          /^https:/,
          "wss:"
        );

    const url =
      `${websocketBase}` +
      `/ws?clientId=` +
      encodeURIComponent(
        clientId
      );

    return new Promise(
      (resolve, reject) => {
        const ws =
          new WebSocket(url);

        let settled = false;

        const timeout =
          setTimeout(() => {
            if (settled) return;

            settled = true;

            ws.terminate();

            reject(
              new Error(
                "Comfy WebSocket timeout"
              )
            );
          }, timeoutMs);

        const cleanup = () => {
          clearTimeout(timeout);
        };

        ws.once(
          "message",
          data => {
            if (settled) return;

            settled = true;
            cleanup();

            try {
              resolve(
                JSON.parse(
                  data.toString()
                )
              );
            }
            catch {
              resolve(
                data.toString()
              );
            }

            ws.close();
          }
        );

        ws.once(
          "error",
          error => {
            if (settled) return;

            settled = true;
            cleanup();

            reject(error);
          }
        );
      }
    );
  }
}
