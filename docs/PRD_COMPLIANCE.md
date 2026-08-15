# PRD Compliance Matrix

This matrix maps each core product requirement to its implementation in the codebase and the verifying test suites.

| PRD Requirement | Implementation | Verification Suite |
| :--- | :--- | :--- |
| **Offline Event Capture** | Local buffer queuing | [`eventRepository.test.ts`](file:///c:/Users/Admin/Desktop/hackathon/apps/mobile/tests/repositories/eventRepository.test.ts) |
| **SQLite Persistence** | Native SQLite and Web localStorage fallback | [`ExpoAdapter.ts`](file:///c:/Users/Admin/Desktop/hackathon/apps/mobile/src/database/ExpoAdapter.ts), [`WebDatabaseAdapter.ts`](file:///c:/Users/Admin/Desktop/hackathon/apps/mobile/src/database/WebDatabaseAdapter.ts) |
| **Event Synchronization** | SyncManager with dynamic states | [`syncManager.test.ts`](file:///c:/Users/Admin/Desktop/hackathon/apps/mobile/tests/services/syncManager.test.ts) |
| **REST API Ingest** | `POST /events` express controller | [`events.test.ts`](file:///c:/Users/Admin/Desktop/hackathon/backend/tests/api/events.test.ts) |
| **Idempotency** | PostgreSQL unique rules and duplicate payload comparisons | [`postgres.test.ts`](file:///c:/Users/Admin/Desktop/hackathon/backend/tests/persistence/postgres.test.ts) |
| **Conflict Resolution Rules** | AI vs Satellite vs Manual logic thresholds | [`reconcile.test.ts`](file:///c:/Users/Admin/Desktop/hackathon/backend/tests/domain/reconciliation/reconcile.test.ts) |
| **Late / Out-of-Order Invariance** | Sorting by timestamp and ID before reconciliation | [`reconcile.test.ts`](file:///c:/Users/Admin/Desktop/hackathon/backend/tests/domain/reconciliation/reconcile.test.ts) |
| **Deterministic State Hash** | SHA-256 hash computed over ordered event lists | [`reconcile.ts`](file:///c:/Users/Admin/Desktop/hackathon/backend/src/domain/reconciliation/reconcile.ts) |
| **Deterministic Replay** | Out-of-order execution equivalence checking | [`auditAndReplay.test.ts`](file:///c:/Users/Admin/Desktop/hackathon/backend/tests/api/auditAndReplay.test.ts) |
| **Audit Trails & Versioning** | Immutable log tracking with Supabase | [`supabaseAuditLogRepository.ts`](file:///c:/Users/Admin/Desktop/hackathon/backend/src/repositories/supabaseAuditLogRepository.ts) |
| **10MB Size Limit** | Schema validator checks | [`events.ts`](file:///c:/Users/Admin/Desktop/hackathon/backend/src/routes/events.ts) |
| **Transient Retry Backoff** | Exponential delays during synchronization | [`syncManager.ts`](file:///c:/Users/Admin/Desktop/hackathon/apps/mobile/src/services/syncManager.ts) |
