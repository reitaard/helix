import type { Pool } from "pg";

export interface FaceFusionJobCatalogEntry {
  id: string;
  jobNumber: string;
  status: string;
  workerId: string | null;
  backendJobId: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  generation: Record<string, unknown>;
  artifact: Record<string, unknown> | null;
}

export interface FaceFusionJobOwner {
  chatId: string;
  threadId: string | null;
  userId: string;
}

interface Row {
  id: string; job_number: string; status: string; worker_id: string | null; backend_job_id: string | null;
  created_at: Date; started_at: Date | null; finished_at: Date | null; request: unknown; result: unknown | null;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function map(row: Row): FaceFusionJobCatalogEntry {
  const request = record(row.request);
  const generation = record(request.generation);
  const result = record(row.result);
  const artifacts = Array.isArray(result.artifacts) ? result.artifacts : [];
  const artifact = artifacts.find(value => value && typeof value === "object" && !Array.isArray(value)) ?? null;
  return {
    id: row.id, jobNumber: row.job_number, status: row.status, workerId: row.worker_id, backendJobId: row.backend_job_id,
    createdAt: row.created_at.toISOString(), startedAt: row.started_at?.toISOString() ?? null, finishedAt: row.finished_at?.toISOString() ?? null,
    generation, artifact: artifact as Record<string, unknown> | null
  };
}

/** FaceFusion-only catalog; ownership is checked in SQL against durable Telegram context. */
export class FaceFusionJobCatalog {
  constructor(private readonly db: Pool) {}

  private params(owner: FaceFusionJobOwner) { return [owner.chatId, owner.threadId, owner.userId]; }
  private where() {
    return `j.tool = 'face.swap'
      AND j.delivery_context->>'provider' = 'telegram'
      AND j.delivery_context->>'botKey' = 'facefusion'
      AND j.delivery_context->>'chatId' = $1
      AND COALESCE(j.delivery_context->>'threadId', '') = COALESCE($2::text, '')
      AND j.delivery_context->>'userId' = $3`;
  }

  async list(owner: FaceFusionJobOwner, limit = 10): Promise<FaceFusionJobCatalogEntry[]> {
    const result = await this.db.query<Row>(`SELECT j.id, j.job_number, j.status, j.worker_id, j.backend_job_id, j.created_at, j.started_at, j.finished_at, j.request, j.result FROM media_jobs j WHERE ${this.where()} ORDER BY j.created_at DESC LIMIT $4`, [...this.params(owner), Math.max(1, Math.min(20, Math.floor(limit)))]);
    return result.rows.map(map);
  }

  async get(owner: FaceFusionJobOwner, jobNumber: string): Promise<FaceFusionJobCatalogEntry | null> {
    if (!/^[1-9]\d*$/.test(jobNumber)) return null;
    const result = await this.db.query<Row>(`SELECT j.id, j.job_number, j.status, j.worker_id, j.backend_job_id, j.created_at, j.started_at, j.finished_at, j.request, j.result FROM media_jobs j WHERE ${this.where()} AND j.job_number = $4::bigint`, [...this.params(owner), jobNumber]);
    return result.rows[0] ? map(result.rows[0]) : null;
  }

  async queue(owner: FaceFusionJobOwner) {
    const result = await this.db.query<{ id: string; capacity: number; total: number; running: number; waiting: number; face_running: number; face_waiting: number; current_tool: string | null; current_job_number: string | null; own_job_number: string | null; own_status: string | null; own_position: number | null }>(`
      WITH resource AS (SELECT id, capacity FROM execution_resources WHERE id = 'helix-gpu-rtx4060-01'),
      active AS (SELECT * FROM media_jobs WHERE resource_id = (SELECT id FROM resource) AND status IN ('accepted','queued','running','finalizing')),
      ordered AS (SELECT *, row_number() OVER (ORDER BY created_at, id) AS position FROM active WHERE status IN ('accepted','queued'))
      SELECT r.id, r.capacity,
        (SELECT count(*)::int FROM active) AS total,
        (SELECT count(*)::int FROM active WHERE status IN ('running','finalizing')) AS running,
        (SELECT count(*)::int FROM active WHERE status IN ('accepted','queued')) AS waiting,
        (SELECT count(*)::int FROM active WHERE tool = 'face.swap' AND status IN ('running','finalizing')) AS face_running,
        (SELECT count(*)::int FROM active WHERE tool = 'face.swap' AND status IN ('accepted','queued')) AS face_waiting,
        (SELECT tool FROM active WHERE status IN ('running','finalizing') ORDER BY created_at LIMIT 1) AS current_tool,
        (SELECT job_number FROM active WHERE status IN ('running','finalizing') ORDER BY created_at LIMIT 1) AS current_job_number,
        o.job_number AS own_job_number, o.status AS own_status, o.position::int AS own_position
      FROM resource r LEFT JOIN ordered o ON o.tool = 'face.swap'
        AND o.delivery_context->>'provider' = 'telegram' AND o.delivery_context->>'botKey' = 'facefusion'
        AND o.delivery_context->>'chatId' = $1 AND COALESCE(o.delivery_context->>'threadId','') = COALESCE($2::text,'') AND o.delivery_context->>'userId' = $3
      ORDER BY o.position NULLS LAST` , this.params(owner));
    return result.rows;
  }
}
