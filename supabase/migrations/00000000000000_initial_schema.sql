-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Table: verification_events
CREATE TABLE IF NOT EXISTS verification_events (
    event_id UUID PRIMARY KEY,
    verification_id UUID NOT NULL,
    source TEXT NOT NULL,
    confidence REAL NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL,
    data JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table: verification_decisions
CREATE TABLE IF NOT EXISTS verification_decisions (
    id SERIAL PRIMARY KEY,
    verification_id UUID NOT NULL,
    version INTEGER NOT NULL,
    status TEXT NOT NULL,
    reason TEXT,
    state_hash TEXT NOT NULL,
    decision_timestamp TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(verification_id, version)
);

-- Table: audit_logs
CREATE TABLE IF NOT EXISTS audit_logs (
    id SERIAL PRIMARY KEY,
    verification_id UUID NOT NULL,
    decision_version INTEGER NOT NULL,
    considered_event_ids JSONB NOT NULL,
    explanation JSONB NOT NULL,
    state_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_verification_events_verification_id ON verification_events(verification_id);
CREATE INDEX IF NOT EXISTS idx_verification_events_timestamp ON verification_events(timestamp);
CREATE INDEX IF NOT EXISTS idx_verification_decisions_verification_id ON verification_decisions(verification_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_verification_id ON audit_logs(verification_id);
