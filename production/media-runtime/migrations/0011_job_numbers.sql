BEGIN;

LOCK TABLE media_jobs IN EXCLUSIVE MODE;

CREATE SEQUENCE IF NOT EXISTS media_jobs_job_number_seq
AS BIGINT;

ALTER TABLE media_jobs
ADD COLUMN IF NOT EXISTS job_number BIGINT;

WITH base AS (
  SELECT COALESCE(MAX(job_number), 0) AS value
  FROM media_jobs
),
numbered AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      ORDER BY created_at, id
    ) AS value
  FROM media_jobs
  WHERE job_number IS NULL
)
UPDATE media_jobs AS jobs
SET job_number = base.value + numbered.value
FROM base, numbered
WHERE jobs.id = numbered.id;

SELECT setval(
  'media_jobs_job_number_seq',
  COALESCE(
    (SELECT MAX(job_number) + 1 FROM media_jobs),
    1
  ),
  false
);

ALTER TABLE media_jobs
ALTER COLUMN job_number
SET DEFAULT nextval('media_jobs_job_number_seq');

ALTER SEQUENCE media_jobs_job_number_seq
OWNED BY media_jobs.job_number;

ALTER TABLE media_jobs
ALTER COLUMN job_number SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS media_jobs_job_number_idx
ON media_jobs (job_number);

COMMIT;
