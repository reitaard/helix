import crypto from "node:crypto";
import { basename, extname, join } from "node:path";
import { createWriteStream } from "node:fs";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { JobService } from "../jobs/service.js";
import { FaceFusionConversationRepository } from "../repositories/facefusion-conversation-repository.js";
import { FaceFusionSettingsRepository, type FaceFusionSettingsScope } from "../repositories/facefusion-settings-repository.js";
import { FaceFusionJobCatalog, type FaceFusionJobCatalogEntry } from "../repositories/facefusion-job-catalog.js";
import { TelegramPollOffsetRepository } from "../repositories/telegram-poll-offset-repository.js";
import { TelegramJobLifecycleRepository } from "../repositories/telegram-job-lifecycle-repository.js";
import { WorkerRegistry } from "../workers/registry.js";
import { TelegramDelivery } from "../delivery/telegram.js";
import {
  FACEFUSION_DISPLAY_MODEL,
  normalizeFaceFusionSettings
} from "../facefusion/settings.js";
import {
  FACEFUSION_DEV_DURATION_MAX,
  FACEFUSION_NORMAL_DURATION_DEFAULT,
  FACEFUSION_NORMAL_DURATION_MAX,
  faceFusionDurationLimit,
  normalizeFaceFusionSessionSettings,
  type FaceFusionProfileSettings,
  type FaceFusionSessionSettings
} from "../facefusion/profile-settings.js";
import { validateFaceFusionMedia } from "../facefusion/media-validation.js";
import { commandForBot } from "./context.js";
import { escapeHtml, profileTitle } from "./presentation.js";

interface TelegramMedia { fileId: string; filename: string; mediaKind: "image" | "video"; size: number | null }
interface Message {
  text?: string; message_id?: string | number; message_thread_id?: string | number;
  chat?: { id: string | number; type?: string }; from?: { id: string | number };
  photo?: Array<{ file_id?: string; file_size?: number }>;
  video?: { file_id?: string; file_name?: string; file_size?: number; mime_type?: string };
  document?: { file_id?: string; file_name?: string; file_size?: number; mime_type?: string };
}
interface Update { update_id: number; message?: Message; callback_query?: { id?: string; data?: string; from?: { id: string | number }; message?: Message } }
interface Envelope<T> { ok?: boolean; result?: T; description?: string }

class InvalidFaceFusionMediaError extends Error {}
class FaceFusionDurationError extends Error { constructor(readonly limit: number) { super("FaceFusion video exceeds duration policy"); } }

function settingName(value: string) {
  const key = value.toLowerCase().replace(/[._-]+/g, "");
  if (["mode", "face", "facemode", "m"].includes(key)) return "mode";
  if (["str", "strength", "weight", "w"].includes(key)) return "strength";
  if (["px", "pixel", "boost", "pb"].includes(key)) return "boost";
  if (["t", "time", "duration"].includes(key)) return "time";
  return null;
}

function mediaFromMessage(message: Message): TelegramMedia | null {
  const photo = message.photo?.at(-1);
  if (photo?.file_id) return { fileId: photo.file_id, filename: `telegram-${photo.file_id}.jpg`, mediaKind: "image", size: photo.file_size ?? null };
  if (message.video?.file_id) return { fileId: message.video.file_id, filename: basename(message.video.file_name ?? `telegram-${message.video.file_id}.mp4`), mediaKind: "video", size: message.video.file_size ?? null };
  const document = message.document;
  if (document?.file_id) {
    const extension = extname(document.file_name ?? "").toLowerCase();
    const image = [".jpg", ".jpeg", ".png", ".webp"].includes(extension) || document.mime_type?.startsWith("image/");
    const video = [".mp4", ".mov", ".m4v", ".mkv", ".webm"].includes(extension) || document.mime_type?.startsWith("video/");
    if (image && !video) return { fileId: document.file_id, filename: basename(document.file_name ?? `telegram-${document.file_id}.jpg`), mediaKind: "image", size: document.file_size ?? null };
    if (video && !image) return { fileId: document.file_id, filename: basename(document.file_name ?? `telegram-${document.file_id}.mp4`), mediaKind: "video", size: document.file_size ?? null };
  }
  return null;
}

export interface FaceFusionForumDestination { chatId: string; threadId: string }
export interface FaceFusionDestination { chatId: string; threadId: string | null }

export function faceFusionDestination(message: Message, operatorChatId: string, forum: FaceFusionForumDestination | null = null): FaceFusionDestination | null {
  if (!message.chat || message.from?.id === undefined) return null;
  const chatId = String(message.chat.id);
  if (message.chat.type === "private" && chatId === operatorChatId && String(message.from.id) === operatorChatId) return { chatId, threadId: null };
  if (forum && message.chat.type === "supergroup" && chatId === forum.chatId && String(message.message_thread_id ?? "") === forum.threadId) {
    return { chatId, threadId: forum.threadId };
  }
  return null;
}

export function isAuthorizedFaceFusionMessage(message: Message, operatorChatId: string, forum: FaceFusionForumDestination | null = null) {
  return faceFusionDestination(message, operatorChatId, forum) !== null;
}

export class TelegramFaceFusionService {
  private running = false;
  private abort: AbortController | null = null;
  private offset: number | undefined;
  private bot: { id: string; username: string } | null = null;

  constructor(
    private readonly botToken: string,
    private readonly operatorChatId: string,
    private readonly workerId: string,
    private readonly jobs: JobService,
    private readonly conversations: FaceFusionConversationRepository,
    private readonly settings: FaceFusionSettingsRepository,
    private readonly lifecycles: TelegramJobLifecycleRepository,
    private readonly pollOffsets: TelegramPollOffsetRepository,
    private readonly workers: WorkerRegistry,
    private readonly telegram: TelegramDelivery,
    private readonly spoolDir: string,
    private readonly maxInputBytes: number,
    private readonly catalog: FaceFusionJobCatalog,
    private readonly forum: FaceFusionForumDestination | null = null,
    private readonly conversationSeconds = 1800,
    private readonly mediaValidator = validateFaceFusionMedia
  ) {}

  private endpoint(method: string) { return `https://api.telegram.org/bot${this.botToken}/${method}`; }
  private async api<T>(method: string, body: unknown, signal?: AbortSignal): Promise<T> {
    const response = await fetch(this.endpoint(method), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), ...(signal ? { signal } : {}) });
    const parsed = await response.json() as Envelope<T>;
    if (!response.ok || parsed.ok !== true) throw new Error(`${method} failed: ${parsed.description ?? `HTTP ${response.status}`}`);
    return parsed.result as T;
  }
  private expiry() { return new Date(Date.now() + this.conversationSeconds * 1000); }

  private confirmation(session: FaceFusionSessionSettings) {
    const settings = normalizeFaceFusionSettings(session.generation);
    const target = session.target;
    if (!target) throw new Error("FaceFusion confirmation is missing target metadata");
    const duration = target.mediaKind === "video"
      ? `\n<b>Duration</b> · <b>${target.durationSeconds!.toFixed(1)}s${session.dev && target.durationSeconds! > session.normalDurationSeconds ? " (Override)" : ""}</b>`
      : "";
    const access = session.dev ? `\n<b>Access</b> · <b>DEV</b>` : "";
    const limit = !session.dev ? `\n\n<b>Limit</b> · <b>${session.normalDurationSeconds}s</b>` : "";
    return `${profileTitle("FaceFusion")}\n\n<b>Model</b> · <b>${FACEFUSION_DISPLAY_MODEL}</b>\n<b>Target</b> · <b>${target.mediaKind === "video" ? "Video" : "Image"}</b>${duration}\n<b>Dimensions</b> · <b>${target.width}×${target.height}</b>${access}\n\n<b>Face Mode</b> · <b>${settings.faceSelectorMode === "one" ? "One" : "Native"}</b>\n<b>Strength</b> · <b>${settings.weight === undefined ? "Native" : settings.weight.toFixed(2)}</b>\n<b>Pixel Boost</b> · <b>${settings.pixelBoost === undefined ? "Native" : settings.pixelBoost.split("x", 1)[0]}</b>${limit}`;
  }

  private async cleanupHandles(handles: Array<string | null>) {
    await Promise.all(handles.filter((v): v is string => Boolean(v)).map(async handle => {
      try { await this.workers.deleteInput(this.workerId, handle); }
      catch (error) { console.error(`[facefusion] input cleanup ${handle} failed`, error); }
    }));
  }

  private async clearConfirmationKeyboard(messageId: string | null, destination: FaceFusionDestination) {
    if (!messageId) return;
    try {
      await this.api("editMessageReplyMarkup", {
        chat_id: destination.chatId,
        message_id: Number(messageId),
        reply_markup: { inline_keyboard: [] }
      });
    }
    catch (error) { console.error("[facefusion-telegram] inline keyboard cleanup failed", error); }
  }

  private async removeConversation(userId: string, destination: FaceFusionDestination) {
    if (!this.bot) throw new Error("FaceFusion bot is not initialized");
    const removed = await this.conversations.remove(this.bot.id, destination.chatId, destination.threadId, userId);
    if (!removed) return null;
    await this.cleanupHandles([removed.sourceInputHandle, removed.targetInputHandle]);
    await this.clearConfirmationKeyboard(removed.confirmationMessageId, destination);
    return removed;
  }

  private scope(userId: string, destination: FaceFusionDestination): FaceFusionSettingsScope {
    if (!this.bot) throw new Error("FaceFusion bot is not initialized");
    return { botId: this.bot.id, chatId: destination.chatId, threadId: destination.threadId, userId };
  }

  private isPrivateOperator(destination: FaceFusionDestination, userId: string) {
    return destination.threadId === null && destination.chatId === this.operatorChatId && userId === this.operatorChatId;
  }

  private sourcePrompt() {
    return `${profileTitle("FaceFusion")}\nSend the source face image.\nSquare 512–1024 px is recommended, but not required.`;
  }

  private settingsPanel(value: FaceFusionProfileSettings, dev: boolean) {
    const generation = normalizeFaceFusionSettings(value.generation);
    const mode = generation.faceSelectorMode === "one" ? "One" : "Native";
    const strength = generation.weight === undefined ? "Native" : generation.weight.toFixed(2);
    const boost = generation.pixelBoost === undefined ? "Native" : generation.pixelBoost.split("x", 1)[0];
    return `${profileTitle("FaceFusion", "SETTINGS")}${dev ? " <b>(dev)</b>" : ""}\n\n<b>HyperSwap B</b>\n└ face.swap\n\n• core •\n\n<code>mode</code>.Face Mode : <b>${mode}</b>\n<code>str</code>.Strength : <b>${strength}</b>\n<code>pb</code>.Pixel Boost : <b>${boost}</b>\n<code>time</code>.Duration : <b>${value.normalDurationSeconds}s Max</b>${dev ? `\n\n• advanced •\n\n<code>time</code>.Duration Override : <b>${value.devDurationSeconds === null ? "Native" : `${value.devDurationSeconds}s Max`}</b>` : ""}\n\nInspect · <code>/f set ${dev ? "-d " : ""}&lt;setting&gt;</code>\nAliases · <code>/fs${dev ? " -d" : ""}</code>`;
  }

  private settingHelp(name: string, dev: boolean) {
    if (name === "mode") return `${profileTitle("FaceFusion", "MODE")}\nNative\nOne\n\nSet · <code>/f set mode &lt;native|one&gt;</code>`;
    if (name === "strength") return `${profileTitle("FaceFusion", "STRENGTH")}\nNative\n0.35\n0.50\n0.65\n\nSet · <code>/f set strength &lt;value&gt;</code>`;
    if (name === "boost") return `${profileTitle("FaceFusion", "PIXEL BOOST")}\nNative\n256\n512\n\nSet · <code>/f set boost &lt;native|256|512&gt;</code>`;
    return `${profileTitle("FaceFusion", "DURATION")}\n${dev ? `Developer · Native or 1–${FACEFUSION_DEV_DURATION_MAX} seconds\nSet · <code>/f set -d time &lt;native|seconds&gt;</code>` : `Normal · 1–${FACEFUSION_NORMAL_DURATION_MAX} seconds\nSet · <code>/f set time &lt;seconds&gt;</code>`}\n\nUse -d/-dev only in private operator chat.`;
  }

  private help(devAllowed: boolean) {
    return `${profileTitle("FaceFusion", "COMMANDS")}\n\n<code>/f</code>     Start face swap\n<code>/fs</code>    Settings\n<code>/fq</code>    Queue\n<code>/fj</code>    Recent jobs\n<code>/fd</code>    Downloads\n<code>/c</code>     Cancel\n<code>/h</code>     Help${devAllowed ? "\n\n• developer •\n\n<code>/f -d</code>\n<code>/fs -d</code>" : ""}`;
  }

  private owner(userId: string, destination: FaceFusionDestination) { return { chatId: destination.chatId, threadId: destination.threadId, userId }; }
  private runtime(job: FaceFusionJobCatalogEntry) {
    if (!job.startedAt) return job.status === "accepted" || job.status === "queued" ? "waiting" : "not started";
    const end = new Date(job.finishedAt ?? Date.now()).getTime();
    const seconds = Math.max(0, Math.floor((end - new Date(job.startedAt).getTime()) / 1000));
    return seconds >= 60 ? `${Math.floor(seconds / 60)}m ${seconds % 60}s` : `${seconds}s`;
  }
  private target(job: FaceFusionJobCatalogEntry) { return job.generation.targetMediaKind === "video" ? "Video" : "Image"; }
  private async queueHtml(userId: string, destination: FaceFusionDestination) {
    const rows = await this.catalog.queue(this.owner(userId, destination));
    const sample = rows[0];
    if (!sample) return `${profileTitle("FaceFusion", "QUEUE")}\n<i>Shared GPU resource is unavailable.</i>`;
    const own = rows.filter(row => row.own_job_number !== null);
    const current = sample.current_job_number ? `\n\n<b>Current GPU</b>\n${sample.current_tool === "face.swap" ? "FaceFusion" : "Comfy"} · <code>#${escapeHtml(sample.current_job_number)}</code>` : "";
    const yours = own.length ? `\n\n<b>Your jobs</b>\n${own.map(row => `<code>#${escapeHtml(row.own_job_number!)}</code> · ${escapeHtml(row.own_status!)} · position ${row.own_position}`).join("\n")}` : "";
    return `${profileTitle("FaceFusion", "QUEUE")}\n\n<b>GPU</b> · RTX 4060\n<b>State</b> · <b>${sample.total > 0 ? "Busy" : "Idle"}</b>\n\n<b>FaceFusion</b>\nRunning · ${sample.face_running}\nWaiting · ${sample.face_waiting}${current}${yours}`;
  }
  private jobHtml(job: FaceFusionJobCatalogEntry) {
    const target = job.generation.target && typeof job.generation.target === "object" ? job.generation.target as Record<string, unknown> : {};
    const dimensions = typeof target.width === "number" && typeof target.height === "number" ? `\n<b>Dimensions</b> · ${target.width}×${target.height}` : "";
    const duration = this.target(job) === "Video" && typeof target.durationSeconds === "number" ? `\n<b>Duration</b> · ${target.durationSeconds.toFixed(1)}s` : "";
    return `${profileTitle("FaceFusion", "JOB")}\n\n<b>Job</b> · <code>#${escapeHtml(job.jobNumber)}</code>\n<b>Status</b> · <b>${escapeHtml(job.status)}</b>\n<b>Model</b> · HyperSwap B\n<b>Target</b> · ${this.target(job)}${duration}${dimensions}\n<b>Runtime</b> · ${this.runtime(job)}`;
  }
  private async jobsHtml(userId: string, destination: FaceFusionDestination, reference?: string) {
    if (reference) {
      const job = await this.catalog.get(this.owner(userId, destination), reference);
      return job ? this.jobHtml(job) : `${profileTitle("FaceFusion", "JOB")}\n<i>Job not found.</i>`;
    }
    const jobs = await this.catalog.list(this.owner(userId, destination));
    if (!jobs.length) return `${profileTitle("FaceFusion", "JOBS")}\n<i>No FaceFusion jobs yet.</i>`;
    return `${profileTitle("FaceFusion", "JOBS")}\n\n${jobs.map(job => `<code>#${escapeHtml(job.jobNumber)}</code> · <b>${escapeHtml(job.status)}</b>\n${this.target(job)} · HyperSwap B · ${this.runtime(job)}`).join("\n\n")}\n\nInspect · <code>/fj &lt;job&gt;</code>`;
  }
  private async download(userId: string, destination: FaceFusionDestination, reference?: string) {
    if (!reference) {
      const jobs = (await this.catalog.list(this.owner(userId, destination))).filter(job => job.status === "succeeded" && job.artifact);
      return jobs.length ? `${profileTitle("FaceFusion", "DOWNLOADS")}\n\n${jobs.map(job => `<code>#${escapeHtml(job.jobNumber)}</code> · ${this.target(job)}\nDownload · <code>/fd ${escapeHtml(job.jobNumber)}</code>`).join("\n\n")}` : `${profileTitle("FaceFusion", "DOWNLOADS")}\n<i>No completed artifacts.</i>`;
    }
    const job = await this.catalog.get(this.owner(userId, destination), reference);
    if (!job) return `${profileTitle("FaceFusion", "DOWNLOAD")}\n<i>Job not found.</i>`;
    if (job.status !== "succeeded" || !job.artifact || !job.workerId) return `${profileTitle("FaceFusion", "DOWNLOAD")}\nArtifact is no longer available.`;
    const artifact = job.artifact;
    if (typeof artifact.filename !== "string" || typeof artifact.type !== "string" || typeof artifact.artifactId !== "string" || (artifact.mediaKind !== "image" && artifact.mediaKind !== "video")) return `${profileTitle("FaceFusion", "DOWNLOAD")}\nArtifact is no longer available.`;
    await mkdir(this.spoolDir, { recursive: true });
    const path = join(this.spoolDir, `facefusion-redownload-${job.id}-${basename(artifact.filename)}`);
    try {
      const downloaded = await this.workers.downloadArtifact(job.workerId, artifact as never, path);
      if (!downloaded) throw new Error("worker unavailable");
      await this.telegram.sendDocumentFile({ filePath: path, filename: basename(artifact.filename), caption: `${profileTitle("FaceFusion")}\n<b>Job</b> · <code>#${escapeHtml(job.jobNumber)}</code>`, destination });
      return null;
    } catch (error) {
      console.error("[facefusion-telegram] artifact redelivery failed", error);
      return `${profileTitle("FaceFusion", "DOWNLOAD")}\nArtifact is no longer available.`;
    } finally { await rm(path, { force: true }); }
  }

  private async begin(userId: string, destination: FaceFusionDestination, dev = false) {
    if (!this.bot) throw new Error("FaceFusion bot is not initialized");
    await this.removeConversation(userId, destination);
    const profile = await this.settings.get(this.scope(userId, destination));
    const session: FaceFusionSessionSettings = { ...profile, dev };
    await this.conversations.begin(this.bot.id, destination.chatId, destination.threadId, userId, session, this.expiry());
    await this.telegram.sendHtml(this.sourcePrompt(), destination);
  }

  private async cancel(userId: string, destination: FaceFusionDestination) {
    const removed = await this.removeConversation(userId, destination);
    await this.telegram.sendHtml(`${profileTitle("FaceFusion")}\n${removed ? "Request cancelled." : "Nothing to cancel."}`, destination);
  }

  private async downloadAndUpload(media: TelegramMedia, role: "source" | "target", session: FaceFusionSessionSettings) {
    if (media.size !== null && media.size > this.maxInputBytes) throw new InvalidFaceFusionMediaError("Telegram media exceeds the configured input limit");
    const file = await this.api<{ file_path?: string; file_size?: number }>("getFile", { file_id: media.fileId });
    if (!file.file_path || file.file_path.includes("..")) throw new InvalidFaceFusionMediaError("Telegram getFile returned an invalid path");
    if (typeof file.file_size === "number" && file.file_size > this.maxInputBytes) throw new InvalidFaceFusionMediaError("Telegram media exceeds the configured input limit");
    await mkdir(this.spoolDir, { recursive: true });
    const directory = await mkdtemp(join(this.spoolDir, "facefusion-input-"));
    const path = join(directory, `${crypto.randomUUID()}-${basename(media.filename)}`);
    try {
      const response = await fetch(`https://api.telegram.org/file/bot${this.botToken}/${file.file_path}`, { signal: AbortSignal.timeout(10 * 60 * 1000) });
      if (!response.ok || !response.body) throw new InvalidFaceFusionMediaError(`Telegram file download failed with HTTP ${response.status}`);
      let bytes = 0;
      const limit = new Transform({ transform: (chunk: Buffer, _encoding, callback) => {
        bytes += chunk.length;
        callback(bytes > this.maxInputBytes ? new InvalidFaceFusionMediaError("Telegram media exceeds the configured input limit") : null, chunk);
      }});
      await pipeline(Readable.fromWeb(response.body as import("node:stream/web").ReadableStream), limit, createWriteStream(path, { flags: "wx" }));
      let metadata;
      try { metadata = await this.mediaValidator(path, media.filename, media.mediaKind); }
      catch (error) { throw new InvalidFaceFusionMediaError(error instanceof Error ? error.message : String(error)); }
      if (metadata.mediaKind === "video" && metadata.durationSeconds! > faceFusionDurationLimit(session)) {
        throw new FaceFusionDurationError(faceFusionDurationLimit(session));
      }
      const uploaded = await this.workers.uploadInput(this.workerId, path, { filename: media.filename, mediaKind: media.mediaKind, role });
      if (!uploaded) throw new Error("FaceFusion input upload is unavailable");
      return { handle: uploaded.handle, metadata };
    }
    finally { await rm(directory, { recursive: true, force: true }); }
  }

  private devDenied() {
    return `${profileTitle("FaceFusion")}\nDeveloper mode is available in the private operator chat only.`;
  }

  private invalidSetting(message = "Invalid value.") {
    return `${profileTitle("FaceFusion")}\n${message}`;
  }

  private async setSetting(userId: string, destination: FaceFusionDestination, dev: boolean, rawName: string, rawValue: string) {
    if (dev && !this.isPrivateOperator(destination, userId)) return this.devDenied();
    const name = settingName(rawName);
    if (!name) return this.invalidSetting("Unknown setting.");
    if (!rawValue) return this.settingHelp(name, dev);
    const value = rawValue.toLowerCase();
    const profile = await this.settings.get(this.scope(userId, destination));
    const generation = { ...normalizeFaceFusionSettings(profile.generation) };
    if (name === "mode") {
      if (value === "native") delete generation.faceSelectorMode;
      else if (value === "one") generation.faceSelectorMode = "one";
      else return this.invalidSetting();
    }
    else if (name === "strength") {
      if (value === "native") delete generation.weight;
      else {
        const candidate = Number(value);
        if (![0.35, 0.5, 0.65].includes(candidate)) return this.invalidSetting();
        generation.weight = candidate as 0.35 | 0.5 | 0.65;
      }
    }
    else if (name === "boost") {
      if (value === "native") delete generation.pixelBoost;
      else if (value === "256" || value === "512") generation.pixelBoost = `${value}x${value}` as "256x256" | "512x512";
      else return this.invalidSetting();
    }
    else {
      if (dev && value === "native") profile.devDurationSeconds = null;
      else {
        const candidate = Number(value);
        if (!Number.isInteger(candidate) || candidate < 1 || candidate > (dev ? FACEFUSION_DEV_DURATION_MAX : FACEFUSION_NORMAL_DURATION_MAX)) {
          return dev
            ? this.invalidSetting(`Invalid value.\nDeveloper duration limit must be between 1 and ${FACEFUSION_DEV_DURATION_MAX} seconds.`)
            : this.invalidSetting("Invalid value.\nNormal duration limit must be between 1 and 60 seconds.");
        }
        if (dev) profile.devDurationSeconds = candidate;
        else profile.normalDurationSeconds = candidate;
      }
    }
    profile.generation = normalizeFaceFusionSettings(generation);
    await this.settings.save(this.scope(userId, destination), profile);
    return this.settingsPanel(profile, dev);
  }

  private async handleSettingsCommand(userId: string, destination: FaceFusionDestination, args: string[]) {
    let dev = false;
    let index = 0;
    if (["-d", "-dev"].includes(args[index]?.toLowerCase() ?? "")) { dev = true; index += 1; }
    if (dev && !this.isPrivateOperator(destination, userId)) return this.devDenied();
    const profile = await this.settings.get(this.scope(userId, destination));
    const name = args[index];
    if (!name) return this.settingsPanel(profile, dev);
    return this.setSetting(userId, destination, dev, name, args.slice(index + 1).join(" ").trim());
  }

  private async handleFaceCommand(command: string, args: string[], userId: string, destination: FaceFusionDestination) {
    if (["/cancel", "/cc", "/c"].includes(command)) { await this.cancel(userId, destination); return true; }
    if (["/help", "/h"].includes(command)) { await this.telegram.sendHtml(this.help(this.isPrivateOperator(destination, userId)), destination); return true; }
    if (command === "/fq") { await this.telegram.sendHtml(await this.queueHtml(userId, destination), destination); return true; }
    if (command === "/fj") { await this.telegram.sendHtml(await this.jobsHtml(userId, destination, args[0]), destination); return true; }
    if (command === "/fd") { const response = await this.download(userId, destination, args[0]); if (response) await this.telegram.sendHtml(response, destination); return true; }
    if (command === "/fs") {
      await this.telegram.sendHtml(await this.handleSettingsCommand(userId, destination, args), destination); return true;
    }
    if (command !== "/face" && command !== "/f") return false;
    const action = args[0]?.toLowerCase();
    if (action === "-d" || action === "-dev") {
      if (!this.isPrivateOperator(destination, userId)) await this.telegram.sendHtml(this.devDenied(), destination);
      else await this.begin(userId, destination, true);
      return true;
    }
    if (!action) { await this.begin(userId, destination, false); return true; }
    if (action === "queue") { await this.telegram.sendHtml(await this.queueHtml(userId, destination), destination); return true; }
    if (action === "jobs") { await this.telegram.sendHtml(await this.jobsHtml(userId, destination, args[1]), destination); return true; }
    if (action === "downloads") { const response = await this.download(userId, destination, args[1]); if (response) await this.telegram.sendHtml(response, destination); return true; }
    if (action === "settings") {
      await this.telegram.sendHtml(await this.handleSettingsCommand(userId, destination, args.slice(1)), destination); return true;
    }
    if (action === "s" || action === "set") {
      await this.telegram.sendHtml(await this.handleSettingsCommand(userId, destination, args.slice(1)), destination); return true;
    }
    if (action === "reset") {
      const dev = ["-d", "-dev"].includes(args[1]?.toLowerCase() ?? "");
      if (dev && !this.isPrivateOperator(destination, userId)) await this.telegram.sendHtml(this.devDenied(), destination);
      else {
        const current = await this.settings.get(this.scope(userId, destination));
        const reset: FaceFusionProfileSettings = dev
          ? { ...current, devDurationSeconds: null }
          : { ...current, generation: {}, normalDurationSeconds: FACEFUSION_NORMAL_DURATION_DEFAULT };
        await this.settings.save(this.scope(userId, destination), reset);
        await this.telegram.sendHtml(this.settingsPanel(reset, dev), destination);
      }
      return true;
    }
    await this.telegram.sendHtml(this.help(this.isPrivateOperator(destination, userId)), destination); return true;
  }

  private settingsButtons() {
    return [[{ text: "BACK", callback_data: "ff:confirm" }]];
  }

  private async showConfirmation(userId: string, destination: FaceFusionDestination) {
    if (!this.bot) return;
    const state = await this.conversations.get(this.bot.id, destination.chatId, destination.threadId, userId);
    if (!state) return;
    const sent = await this.telegram.sendHtmlWithInlineKeyboard(this.confirmation(normalizeFaceFusionSessionSettings(state.settings)), destination, [[
      { text: "GENERATE", callback_data: "ff:generate" }, { text: "SETTINGS", callback_data: "ff:settings" }, { text: "CANCEL", callback_data: "ff:cancel" }
    ]]);
    await this.conversations.setConfirmation(this.bot.id, destination.chatId, destination.threadId, userId, sent.messageId);
  }

  async processUpdate(update: Update) {
    if (!this.bot) throw new Error("FaceFusion bot is not initialized");
    const message = update.message;
    if (message) {
      const destination = faceFusionDestination(message, this.operatorChatId, this.forum);
      if (!destination) return;
      const userId = String(message.from!.id);
      const command = message.text && this.bot ? commandForBot(message.text, this.bot.username) : null;
      if (command) {
        const args = message.text!.trim().split(/\s+/).slice(1);
        await this.handleFaceCommand(command, args, userId, destination);
        return;
      }
      if (message.text?.trim().startsWith("/")) return;

      const state = await this.conversations.get(this.bot.id, destination.chatId, destination.threadId, userId);
      if (!state) return;
      if (state.phase === "confirming") return;
      const session = normalizeFaceFusionSessionSettings(state.settings);
      const media = mediaFromMessage(message);
      if (state.phase === "awaiting_source" && (!media || media.mediaKind !== "image")) {
        await this.telegram.sendHtml(`${profileTitle("FaceFusion")}\nSend a valid source face image.`, destination); return;
      }
      if (!media) {
        await this.telegram.sendHtml(`${profileTitle("FaceFusion")}\nSend the target image or video.`, destination); return;
      }
      let uploaded;
      try { uploaded = await this.downloadAndUpload(media, state.phase === "awaiting_source" ? "source" : "target", session); }
      catch (error) {
        if (error instanceof FaceFusionDurationError) {
          await this.telegram.sendHtml(`${profileTitle("FaceFusion")}\nVideo is too long.\nCurrent limit · ${error.limit}s\nUse developer mode from the private operator chat for longer targets.`, destination); return;
        }
        if (error instanceof InvalidFaceFusionMediaError) {
          await this.telegram.sendHtml(`${profileTitle("FaceFusion")}\n${state.phase === "awaiting_source" ? "Send a valid source face image." : "Send a valid target image or video."}`, destination); return;
        }
        throw error;
      }
      try {
        if (state.phase === "awaiting_source") {
          if (!await this.conversations.setSource(this.bot.id, destination.chatId, destination.threadId, userId, uploaded.handle, media.mediaKind, this.expiry())) throw new Error("FaceFusion conversation changed while storing source");
        }
        else {
          const nextSession: FaceFusionSessionSettings = { ...session, target: uploaded.metadata };
          if (!await this.conversations.setTarget(this.bot.id, destination.chatId, destination.threadId, userId, uploaded.handle, media.mediaKind, nextSession, this.expiry())) throw new Error("FaceFusion conversation changed while storing target");
        }
      }
      catch (error) {
        await this.cleanupHandles([uploaded.handle]);
        throw error;
      }
      if (state.phase === "awaiting_source") {
        await this.telegram.sendHtml(`${profileTitle("FaceFusion")}\nSource received.\nSend the target image or video.`, destination);
      }
      else await this.showConfirmation(userId, destination);
      return;
    }

    const callback = update.callback_query;
    const callbackMessage = callback?.message;
    if (!callback || !callbackMessage || !callback.from) return;
    const destination = faceFusionDestination({ ...callbackMessage, from: callback.from }, this.operatorChatId, this.forum);
    if (!destination) return;
    if (callback.id) await this.api("answerCallbackQuery", { callback_query_id: callback.id });
    const userId = String(callback.from.id);
    const state = await this.conversations.get(this.bot.id, destination.chatId, destination.threadId, userId);
    if (!state || state.phase !== "confirming" || state.confirmationMessageId !== String(callbackMessage.message_id ?? "")) return;
    const action = callback.data ?? "";
    if (action === "ff:cancel") {
      await this.removeConversation(userId, destination);
      await this.telegram.sendHtml(`${profileTitle("FaceFusion")}\nRequest cancelled.`, destination); return;
    }
    const session = normalizeFaceFusionSessionSettings(state.settings);
    if (action === "ff:settings") {
      const sent = await this.telegram.sendHtmlWithInlineKeyboard(this.settingsPanel(session, session.dev), destination, this.settingsButtons());
      await this.conversations.setConfirmation(this.bot.id, destination.chatId, destination.threadId, userId, sent.messageId);
      return;
    }
    if (action === "ff:confirm") { await this.showConfirmation(userId, destination); return; }
    if (action !== "ff:generate" || !state.sourceInputHandle || !state.targetInputHandle) return;

    const settings = normalizeFaceFusionSettings(session.generation);
    let jobCreated = false;
    try {
      const job = await this.jobs.create({
        tool: "face.swap", workerId: this.workerId, profileId: "faceswap",
        workflow: { sourceInputId: state.sourceInputHandle, targetInputId: state.targetInputHandle, settings },
        inputs: {},
        generation: { kind: "face.swap", model: FACEFUSION_DISPLAY_MODEL, settings, targetMediaKind: state.targetMediaKind, target: session.target, access: session.dev ? "dev" : "normal", durationLimitSeconds: faceFusionDurationLimit(session) },
        deliveryContext: { provider: "telegram", botKey: "facefusion", chatId: destination.chatId, threadId: destination.threadId, userId },
        idempotencyKey: `telegram:facefusion:${this.bot.id}:${destination.chatId}:${destination.threadId ?? "private"}:${callbackMessage.message_id ?? update.update_id}`
      });
      jobCreated = true;
      await this.conversations.remove(this.bot.id, destination.chatId, destination.threadId, userId);
      const queuedHtml = `${profileTitle("FaceFusion")}\n<b>Status</b> · <b>Queued</b>\n<b>Job</b> · <code>${escapeHtml(job.jobNumber)}</code>`;
      const lifecycleMessageId = callbackMessage.message_id !== undefined
        ? String(callbackMessage.message_id)
        : (await this.telegram.sendHtml(queuedHtml, destination)).messageId;
      if (callbackMessage.message_id !== undefined) {
        try {
          await this.telegram.editHtmlClearingKeyboard(lifecycleMessageId, queuedHtml, destination);
        }
        catch (error) {
          console.error("[facefusion-telegram] confirmation lifecycle edit failed", error);
          const fallback = await this.telegram.sendHtml(queuedHtml, destination);
          await this.lifecycles.attach({ jobId: job.id, botKey: "facefusion", chatId: destination.chatId, threadId: destination.threadId, messageId: fallback.messageId, lastJobStatus: "accepted" });
          await this.conversations.remove(this.bot.id, destination.chatId, destination.threadId, userId);
          return;
        }
      }
      await this.lifecycles.attach({ jobId: job.id, botKey: "facefusion", chatId: destination.chatId, threadId: destination.threadId, messageId: lifecycleMessageId, lastJobStatus: "accepted" });
      await this.conversations.remove(this.bot.id, destination.chatId, destination.threadId, userId);
    }
    catch (error) {
      const removed = await this.conversations.remove(this.bot.id, destination.chatId, destination.threadId, userId);
      if (removed && !jobCreated) await this.cleanupHandles([removed.sourceInputHandle, removed.targetInputHandle]);
      throw error;
    }
  }

  private updateDestination(update: Update) {
    if (update.message) return faceFusionDestination(update.message, this.operatorChatId, this.forum);
    const callback = update.callback_query;
    return callback?.message && callback.from
      ? faceFusionDestination({ ...callback.message, from: callback.from }, this.operatorChatId, this.forum)
      : null;
  }

  async initialize() {
    const me = await this.api<{ id?: string | number; username?: string }>("getMe", {});
    if ((typeof me.id !== "string" && typeof me.id !== "number") || !me.username) throw new Error("FaceFusion getMe returned invalid identity");
    this.bot = { id: String(me.id), username: me.username };
    const stored = await this.pollOffsets.get(this.bot.id);
    if (stored !== null) this.offset = stored;
    else {
      const latest = await this.api<Update[]>("getUpdates", { offset: -1, limit: 1, timeout: 0, allowed_updates: ["message", "callback_query"] });
      this.offset = latest.at(-1)?.update_id ? latest.at(-1)!.update_id + 1 : 0;
      await this.pollOffsets.save(this.bot.id, this.offset);
    }
  }

  async sweepExpired() {
    for (const state of await this.conversations.takeExpired()) await this.cleanupHandles([state.sourceInputHandle, state.targetInputHandle]);
  }

  async start() {
    if (this.running) return;
    this.running = true;
    let initialized = false;
    while (this.running) {
      try {
        if (!initialized) { await this.initialize(); initialized = true; }
        this.abort = new AbortController();
        const updates = await this.api<Update[]>("getUpdates", { offset: this.offset, limit: 20, timeout: 25, allowed_updates: ["message", "callback_query"] }, this.abort.signal);
        this.abort = null;
        for (const update of updates) {
          try { await this.processUpdate(update); }
          catch (error) {
            console.error("[facefusion-telegram] update failed", error);
            const destination = this.updateDestination(update);
            if (destination) {
              try { await this.telegram.sendHtml("<b>[ ERROR ]</b>\n<i>FaceFusion request failed. Try again.</i>", destination); }
              catch (sendError) { console.error("[facefusion-telegram] error response failed", sendError); }
            }
          }
          this.offset = update.update_id + 1;
          await this.pollOffsets.save(this.bot!.id, this.offset);
        }
        await this.sweepExpired();
      }
      catch (error) {
        this.abort = null;
        if (!this.running) break;
        console.error("[facefusion-telegram] polling failed; retrying", error);
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }
    this.running = false;
  }
  stop() { this.running = false; this.abort?.abort(); this.abort = null; }
}

export const faceFusionTelegramMedia = { mediaFromMessage };
