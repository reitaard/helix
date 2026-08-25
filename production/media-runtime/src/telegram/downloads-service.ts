import {
  basename,
  join
} from "node:path";

import {
  mkdir,
  mkdtemp,
  rm,
  writeFile
} from "node:fs/promises";

import type {
  AdapterArtifact
} from "../domain/media-adapter.js";

import {
  inspectComfyWorkflow,
  parseComfyHistory,
  type ComfyHistoryItem,
  type ComfyWorkflowInspection
} from "../adapters/comfy/history.js";

import {
  ArtifactSourceRepository
} from "../repositories/artifact-source-repository.js";

import {
  WorkerRegistry
} from "../workers/registry.js";

import {
  TelegramDelivery
} from "../delivery/telegram.js";

import {
  createStoredZip
} from "../delivery/zip.js";

import {
  escapeHtml,
  formatEventTimestamp,
  shortJobId,
  title
} from "./presentation.js";

interface SourceContext {
  source: string;
  tool: string | null;
  jobId: string | null;
}

function clip(
  value: string,
  limit: number
) {
  const compact = value
    .replace(/\s+/g, " ")
    .trim();

  return compact.length <= limit
    ? compact
    : `${compact.slice(0, Math.max(0, limit - 3))}...`;
}

function cleanReference(
  value: string
) {
  return value
    .trim()
    .replace(/\.+$/, "");
}

function safeFilename(
  value: string
) {
  const name = basename(
    value.replaceAll("\\", "/")
  ).trim();

  return name || "artifact";
}

function uniqueNames(
  artifacts: AdapterArtifact[]
) {
  const used = new Set<string>();

  return artifacts.map((artifact, index) => {
    const original = safeFilename(artifact.filename);
    let candidate = original;
    let suffix = 2;

    while (used.has(candidate.toLowerCase())) {
      const dot = original.lastIndexOf(".");
      const stem = dot > 0
        ? original.slice(0, dot)
        : original;
      const extension = dot > 0
        ? original.slice(dot)
        : "";

      candidate = `${stem}-${suffix}${extension}`;
      suffix += 1;
    }

    used.add(candidate.toLowerCase());

    return {
      artifact,
      name: candidate,
      localName: `${index + 1}-${candidate}`
    };
  });
}

function artifactSummary(
  item: ComfyHistoryItem
) {
  if (item.artifacts.length === 1) {
    return safeFilename(item.artifacts[0]!.filename);
  }

  return `${item.artifacts.length} files`;
}

export class TelegramDownloadsService {
  private readonly active =
    new Set<string>();

  constructor(
    private readonly workerId: string,
    private readonly spoolDir: string,
    private readonly workers: WorkerRegistry,
    private readonly sources: ArtifactSourceRepository,
    private readonly telegram: TelegramDelivery
  ) {}

  private async history(
    limit: number
  ) {
    const raw =
      await this.workers.history(
        this.workerId,
        limit
      );

    if (!raw) {
      throw new Error(
        "Comfy history is unavailable"
      );
    }

    return parseComfyHistory(raw);
  }

  private async source(
    promptId: string
  ): Promise<SourceContext> {
    const job =
      await this.sources
        .findByBackendJobId(
          promptId
        );

    if (!job) {
      return {
        source: "Comfy UI",
        tool: null,
        jobId: null
      };
    }

    return {
      source:
        this.workers
          .profileDisplayName(
            job.workerId,
            job.profileId
          ),
      tool: job.tool,
      jobId: job.id
    };
  }

  private async resolve(
    reference: string
  ) {
    const clean = cleanReference(reference);

    if (
      clean.length < 4 ||
      !/^[a-zA-Z0-9_-]+$/.test(clean)
    ) {
      return {
        kind: "invalid" as const
      };
    }

    const items = await this.history(100);
    const lower = clean.toLowerCase();
    const matches = items.filter(
      item =>
        item.promptId
          .toLowerCase()
          .startsWith(lower)
    );

    if (matches.length === 0) {
      return {
        kind: "missing" as const
      };
    }

    if (matches.length > 1) {
      return {
        kind: "ambiguous" as const
      };
    }

    return {
      kind: "resolved" as const,
      item: matches[0]!
    };
  }

  async listHtml() {
    const items =
      (await this.history(20))
        .slice(0, 5);

    if (items.length === 0) {
      return (
        `${title("DOWNLOADS")}\n` +
        `<i>No completed Comfy artifacts found.</i>`
      );
    }

    const blocks =
      await Promise.all(
        items.map(async item => {
          const context =
            await this.source(
              item.promptId
            );
          const inspection =
            inspectComfyWorkflow(
              item.workflow
            );
          const completed =
            item.completedAt
              ? ` · <i>${escapeHtml(formatEventTimestamp(item.completedAt))}</i>`
              : "";

          return (
            `<blockquote>` +
            `<code>${escapeHtml(item.promptId.slice(0, 6))}</code> · ` +
            `<b>${escapeHtml(artifactSummary(item))}</b>\n` +
            `<b>${escapeHtml(context.source)}</b> · ` +
            `<i>${escapeHtml(inspection.workflow)}</i>${completed}` +
            `</blockquote>`
          );
        })
      );

    return (
      `${title("DOWNLOADS")}\n` +
      blocks.join("\n") +
      `\n<i>Inspect</i> · <code>/dl &lt;id&gt;</code>`
    );
  }

  private detailsHtml(
    item: ComfyHistoryItem,
    context: SourceContext,
    inspection: ComfyWorkflowInspection
  ) {
    const detailLines = [
      `<b><i>• details •</i></b>`,
      `<b>Workflow</b> · <i>${escapeHtml(inspection.workflow)}</i>`,
      ...(context.tool
        ? [`<b>Tool</b> · <code>${escapeHtml(context.tool)}</code>`]
        : []),
      ...(context.jobId
        ? [`<b>Job</b> · <code>${escapeHtml(shortJobId(context.jobId))}</code>`]
        : []),
      ...(inspection.prompt
        ? [
            `<b>${inspection.promptConfidence === "best_effort" ? "Text" : "Prompt"}</b> · ${escapeHtml(clip(inspection.prompt, 1200))}`
          ]
        : []),
      ...inspection.details.map(
        detail =>
          `<b>${escapeHtml(detail.label)}</b> · ${escapeHtml(clip(detail.value, detail.label === "Negative" ? 500 : 300))}`
      ),
      ...item.artifacts.map(
        (artifact, index) =>
          `<b>File ${index + 1}</b> · <code>${escapeHtml(safeFilename(artifact.filename))}</code>`
      ),
      ...(item.completedAt
        ? [`<b>Completed</b> · <i>${escapeHtml(formatEventTimestamp(item.completedAt))}</i>`]
        : []),
      `<b>Prompt ID</b> · <code>${escapeHtml(item.promptId)}</code>`
    ];

    return (
      `<blockquote expandable>${
        detailLines.join("\n")
      }</blockquote>`
    );
  }

  private async inspectHtml(
    item: ComfyHistoryItem
  ) {
    const context =
      await this.source(item.promptId);
    const inspection =
      inspectComfyWorkflow(item.workflow);

    return (
      `${title("DOWNLOAD")}\n` +
      `<b>ID</b> · <code>${escapeHtml(item.promptId.slice(0, 6))}</code>\n` +
      `<b>Source</b> · <b>${escapeHtml(context.source)}</b>\n` +
      `<b>Files</b> · <b>${item.artifacts.length}</b>\n` +
      this.detailsHtml(
        item,
        context,
        inspection
      ) +
      `\n<i>Get</i> · <code>/dl ${escapeHtml(item.promptId.slice(0, 6))} get</code>`
    );
  }

  private downloadCaption(
    filename: string,
    context: SourceContext,
    inspection: ComfyWorkflowInspection,
    fileCount: number
  ) {
    const lines = [
      `<b>Source</b> · <b>${escapeHtml(context.source)}</b>`,
      `<b>Workflow</b> · <i>${escapeHtml(inspection.workflow)}</i>`,
      `<b>Files</b> · <b>${fileCount}</b>`,
      ...(inspection.prompt
        ? [`<b>${inspection.promptConfidence === "best_effort" ? "Text" : "Prompt"}</b> · ${escapeHtml(clip(inspection.prompt, 350))}`]
        : [])
    ];

    return (
      `${title("DOWNLOAD")}\n` +
      `<code>${escapeHtml(filename)}</code>\n` +
      `<blockquote expandable>${lines.join("\n")}</blockquote>`
    );
  }

  private async transfer(
    item: ComfyHistoryItem
  ) {
    await mkdir(
      this.spoolDir,
      {
        recursive: true,
        mode: 0o700
      }
    );

    const directory =
      await mkdtemp(
        join(
          this.spoolDir,
          "download-"
        )
      );

    try {
      const context =
        await this.source(item.promptId);
      const inspection =
        inspectComfyWorkflow(item.workflow);
      const names = uniqueNames(item.artifacts);
      const downloaded: Array<{
        name: string;
        path: string;
      }> = [];

      for (const entry of names) {
        const destination =
          join(
            directory,
            entry.localName
          );

        const ok =
          await this.workers
            .downloadArtifact(
              this.workerId,
              entry.artifact,
              destination
            );

        if (!ok) {
          throw new Error(
            "Worker became unavailable during download"
          );
        }

        downloaded.push({
          name: entry.name,
          path: destination
        });
      }

      if (downloaded.length === 1) {
        const file = downloaded[0]!;

        await this.telegram
          .sendDocumentFile({
            filePath: file.path,
            filename: file.name,
            caption:
              this.downloadCaption(
                file.name,
                context,
                inspection,
                1
              )
          });

        return;
      }

      const manifestPath =
        join(
          directory,
          "manifest.json"
        );

      await writeFile(
        manifestPath,
        JSON.stringify(
          {
            source: context.source,
            tool: context.tool,
            jobId: context.jobId,
            promptId: item.promptId,
            completedAt: item.completedAt,
            workflow: inspection.workflow,
            prompt: inspection.prompt,
            promptConfidence:
              inspection.promptConfidence,
            details: inspection.details,
            files: downloaded.map(
              file => file.name
            )
          },
          null,
          2
        ),
        {
          encoding: "utf8",
          mode: 0o600
        }
      );

      const bundleName =
        `comfy-${item.promptId.slice(0, 8)}-${downloaded.length}-files.zip`;
      const bundlePath =
        join(directory, bundleName);

      await createStoredZip(
        bundlePath,
        [
          ...downloaded,
          {
            name: "manifest.json",
            path: manifestPath
          }
        ]
      );

      await this.telegram
        .sendDocumentFile({
          filePath: bundlePath,
          filename: bundleName,
          caption:
            this.downloadCaption(
              bundleName,
              context,
              inspection,
              downloaded.length
            )
        });
    }
    finally {
      await rm(
        directory,
        {
          recursive: true,
          force: true
        }
      );
    }
  }

  private startTransfer(
    item: ComfyHistoryItem
  ) {
    if (this.active.has(item.promptId)) {
      return false;
    }

    this.active.add(item.promptId);

    void this.transfer(item)
      .catch(async error => {
        const message =
          error instanceof Error
            ? error.message
            : String(error);

        try {
          await this.telegram.sendHtml(
            `${title("DOWNLOAD FAILED")}\n` +
            `<blockquote>${escapeHtml(clip(message, 1000))}</blockquote>`
          );
        }
        catch (notifyError) {
          console.error(
            "[telegram-download] failure notification failed",
            notifyError
          );
        }
      })
      .finally(() => {
        this.active.delete(item.promptId);
      });

    return true;
  }

  async handleCommand(
    args: string[]
  ): Promise<string | null> {
    if (args.length === 0) {
      return this.listHtml();
    }

    const resolved =
      await this.resolve(args[0] ?? "");

    if (resolved.kind === "invalid") {
      return (
        `${title("DOWNLOAD")}\n` +
        `<b>Usage</b> · <code>/dl &lt;id&gt; [get]</code>`
      );
    }

    if (resolved.kind === "missing") {
      return (
        `${title("DOWNLOAD")}\n` +
        `<i>Artifact history entry not found.</i>`
      );
    }

    if (resolved.kind === "ambiguous") {
      return (
        `${title("DOWNLOAD")}\n` +
        `<i>Prefix is ambiguous. Use more characters.</i>`
      );
    }

    if (args.length === 1) {
      return this.inspectHtml(
        resolved.item
      );
    }

    if (
      args.length === 2 &&
      args[1]?.toLowerCase() === "get"
    ) {
      const started =
        this.startTransfer(
          resolved.item
        );

      return (
        `${title("DOWNLOAD")}\n` +
        (
          started
            ? `<b>Transfer started.</b> · <code>${escapeHtml(resolved.item.promptId.slice(0, 6))}</code>`
            : `<b>Transfer already running.</b> · <code>${escapeHtml(resolved.item.promptId.slice(0, 6))}</code>`
        )
      );
    }

    return (
      `${title("DOWNLOAD")}\n` +
      `<b>Usage</b> · <code>/dl &lt;id&gt; [get]</code>`
    );
  }
}
