export const PRAGMAS = `PRAGMA foreign_keys = ON;`;

export const createTablesSQL = [
  `CREATE TABLE IF NOT EXISTS verification_events (
    event_id TEXT PRIMARY KEY,
    verification_id TEXT NOT NULL,
    source TEXT NOT NULL,
    confidence REAL NOT NULL,
    timestamp TEXT NOT NULL,
    data TEXT NOT NULL,
    created_at TEXT NOT NULL,
    sync_status TEXT NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS sync_queue (
    event_id TEXT PRIMARY KEY,
    sync_status TEXT NOT NULL,
    retry_count INTEGER DEFAULT 0,
    last_attempt_timestamp TEXT,
    error_info TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(event_id),
    FOREIGN KEY(event_id) REFERENCES verification_events(event_id)
  );`,
  `CREATE TABLE IF NOT EXISTS local_decisions (
    verification_id TEXT PRIMARY KEY,
    version INTEGER NOT NULL,
    status TEXT NOT NULL,
    reason TEXT,
    considered_event_ids TEXT NOT NULL,
    evidence TEXT NOT NULL,
    state_hash TEXT NOT NULL,
    decision_timestamp TEXT NOT NULL,
    created_at TEXT NOT NULL
  );`
];
