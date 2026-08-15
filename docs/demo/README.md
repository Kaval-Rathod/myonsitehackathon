# GreenLink Demo Evidence

This document outlines the visual verification steps demonstrating GreenLink's core functionality, verified through our local and remote environments.

---

## 1. Offline Event Capture
* **Behavior**: Mobile app captures events locally when disconnected, updating stats to pending.
* **Flow**: Offline → Event Generated → Pending count increments.
* **Screenshots**: Local SQLite stores pending payload.

---

## 2. Synchronization
* **Behavior**: Re-establishing connection transmits all stored events to the Express server.
* **Flow**: Pending → Syncing → Synced.
* **Screenshots**: Sync logs request success.

---

## 3. Conflict Resolution
* **Behavior**: Opposing classifications from AI monitoring and satellite vegetation indices trigger a `conflict` status.
* **Flow**: AI Verified + Satellite Rejected → Conflict state generated.

---

## 4. Manual Override
* **Behavior**: Auditor manual entry overrides conflict, enforcing the final valid status.
* **Flow**: Manual audit submitted → New version generated overriding prior statuses.

---

## 5. Versioned Audit Trail
* **Behavior**: Decisions are versioned and stored with execution hashes inside Supabase.
* **Properties**: Contains verification ID, event history timeline, reason, considered events, and state hashes.

---

## 6. Deterministic Replay
* **Behavior**: Hashing serialized sorted lists ensures identical state hashes irrespective of input submission order.
* **Result**: Order A (`AI -> Sat -> Manual`) and Order B (`Manual -> Sat -> AI`) yield equivalent SHA-256 state hashes.
