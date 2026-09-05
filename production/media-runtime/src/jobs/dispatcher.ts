import { DispatchRepository, type DispatchClaim } from "../repositories/dispatch-repository.js";
import { FaceFusionHttpError } from "../adapters/facefusion/client.js";
import { WorkerRegistry } from "../workers/registry.js";

function workflowFromClaim(claim: DispatchClaim): Record<string, unknown> {
  if (!claim.request || typeof claim.request !== "object" || Array.isArray(claim.request)) {
    throw new Error("Durable job request is invalid");
  }
  const workflow = (claim.request as Record<string, unknown>).workflow;
  if (!workflow || typeof workflow !== "object" || Array.isArray(workflow)) {
    throw new Error("Durable job request has no adapter payload");
  }
  return workflow as Record<string, unknown>;
}

export class JobDispatcher {
  private timer: NodeJS.Timeout | null = null;
  private ticking = false;

  constructor(
    private readonly dispatches: DispatchRepository,
    private readonly workers: WorkerRegistry,
    private readonly intervalMs = 1000
  ) {}

  start() {
    if (this.timer) return;
    void this.tick();
    this.timer = setInterval(() => void this.tick(), this.intervalMs);
    this.timer.unref();
  }

  stop() {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
  }

  async dispatchOnce() {
    const claim = await this.dispatches.claimNext();
    if (!claim) return false;
    let submitted = false;
    try {
      const submission = await this.workers.submit(
        claim.workerId,
        workflowFromClaim(claim),
        { jobId: claim.jobId, dispatchToken: claim.dispatchToken }
      );
      if (!submission) throw new Error("Worker adapter unavailable");
      submitted = true;
      await this.dispatches.markDispatched({
        jobId: claim.jobId,
        dispatchToken: claim.dispatchToken,
        backendJobId: submission.backendJobId,
        backendResponse: submission.backendResponse
      });
      console.log(`[dispatcher] ${claim.jobId} -> ${claim.workerId}/${submission.backendJobId}`);
    }
    catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!submitted && this.workers.getDefinition?.(claim.workerId)?.adapter === "facefusion") {
        try {
          const recovered = await this.workers.status(claim.workerId, claim.jobId);
          if (recovered) {
            await this.dispatches.markDispatched({ jobId: claim.jobId, dispatchToken: claim.dispatchToken, backendJobId: claim.jobId, backendResponse: recovered });
            console.log(`[dispatcher] ${claim.jobId} -> ${claim.workerId}/${claim.jobId} (recovered)`);
            return true;
          }
        }
        catch (probeError) {
          if (probeError instanceof FaceFusionHttpError && probeError.status === 404) {
            await this.dispatches.markDispatchFailed(claim.jobId, claim.dispatchToken, message);
            console.error(`[dispatcher] ${claim.jobId} failed before worker acceptance: ${message}`);
            return true;
          }
          console.error(`[dispatcher] ${claim.jobId} FaceFusion submission ambiguous; durable claim retained: ${message}`);
          return true;
        }
      }
      if (submitted) {
        // Never release or automatically retry an ambiguous claim: Comfy submission
        // is not idempotent. The durable claim continues to hold resource capacity.
        console.error(`[dispatcher] ${claim.jobId} submission persisted ambiguously; manual reconciliation required: ${message}`);
      }
      else {
        await this.dispatches.markDispatchFailed(claim.jobId, claim.dispatchToken, message);
        console.error(`[dispatcher] ${claim.jobId} failed: ${message}`);
      }
    }
    return true;
  }

  private async tick() {
    if (this.ticking) return;
    this.ticking = true;
    try {
      while (await this.dispatchOnce()) {
        // Continue across independent resources; a full resource returns no claim.
      }
    }
    catch (error) {
      console.error("[dispatcher] tick failed", error);
    }
    finally { this.ticking = false; }
  }
}
