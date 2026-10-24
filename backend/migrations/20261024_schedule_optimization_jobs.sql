BEGIN;

CREATE TABLE IF NOT EXISTS schedule_optimization_job (
    id VARCHAR PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    status VARCHAR NOT NULL DEFAULT 'pending',
    request JSONB NOT NULL,
    result JSONB,
    error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_schedule_optimization_job_user_id
    ON schedule_optimization_job(user_id);

COMMIT;
