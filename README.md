# GreenLink 🌿
## Real-Time Carbon Credit Verification with Offline-First Conflict Resolution

[Watch the GreenLink Demo Video](https://drive.google.com/file/d/1A6Lv7jN7vaPRU-xf-dXPS3k4Nxie1SZZ/view?usp=sharing) | [Architecture](#-architecture) | [Tests](#-verification-results) | [PRD Compliance](./docs/PRD_COMPLIANCE.md)

---

### 🎥 Demo

#### [Watch the GreenLink Demo Video](https://github.com/Kaval-Rathod/myonsitehackathon)

#### **Demo Walkthrough Flow**
1. **Offline Capture**: Generate verification event on the mobile app while disconnected.
2. **Pending Queue**: Event stored locally inside SQLite/LocalStorage (`Pending` count = `1`).
3. **Connectivity Restored**: Enable backend server.
4. **Synchronization**: Click `SYNC NOW` to transmit pending events to the backend.
5. **Conflict Resolution**: Opposing AI/satellite evidence yields a `conflict` status.
6. **Manual Override**: Submitting a manual audit overrides automated signals and resolves the state.
7. **Audit Log Versioning**: Backend registers versioned history in Supabase.
8. **Out-of-Order Replay**: Submit events in scrambled order; the backend computes identical `state_hash` values, proving deterministic replay.

---

### 🚀 What is GreenLink?
GreenLink is an offline-first platform enabling landowners and field workers to securely capture and submit verification evidence (photos, soil metrics) for carbon credit approval. The system resolves evidence streams from **AI classification**, **satellite monitoring**, and **expert audits** using a mathematically deterministic rules engine.

---

### 🧠 How It Works
GreenLink ensures total state invariance by ordering all incoming evidence by timestamp (and event ID for ties) before running the reconciliation engine. Every reconciliation yields a versioned decision and computes a SHA-256 state hash over the sorted logs.

---

### 🏗️ Architecture
```text
      [ React Native / Expo Mobile App ]
                      │ (Offline Database: SQLite/LocalStorage)
                      ▼ (Sync Queue)
            [ Express.js Backend ]
                      │
            [ Supabase (PostgreSQL) ]
 (Tables: verification_events, verification_decisions, audit_logs)
```

---

### ⚡ Key Features
* **Offline-First Storage**: Local database ensures capture works with zero connectivity.
* **CORS Enabled**: Express handles preflight options, allowing secure client-server exchange.
* **Transient Error Recovery**: Sync manager retries failures using exponential backoff.
* **Idempotent Ingestion**: Duplicate event payloads return HTTP `200` with zero state corruption.
* **Deterministic Sorting**: Invariant order resolution prevents race conditions and out-of-order errors.

---

### 🔄 Conflict Resolution Matrix
* **AI (>= 0.8)**: Verified
* **Satellite (>= 0.6)**: Verified
* **AI + Satellite Agreement**: Verified
* **AI + Satellite Disagreement**: `conflict`
* **Manual Override**: Overrides all other states

---

### 🔍 Audit & Replay
* **GET /audit/:id**: Fetches chronological timelines, audit statuses, state hashes, and reasons.
* **POST /replay**: Performs on-demand state reconstruction over arbitrary-ordered event sets.

---

### 🧪 Verification Results

| Component | Result | Status |
| :--- | :--- | :--- |
| TypeScript Typecheck | `tsc --noEmit` | ✅ PASS |
| Backend API/Domain Tests | `jest` (48/48) | ✅ PASS |
| Mobile Offline/Sync Tests | `jest` (34/34) | ✅ PASS |
| Supabase Persistence Tests | `jest` (5/5) | ✅ PASS |

---

### 📦 Project Structure
```text
greenlink/
├── apps/
│   └── mobile/        # React Native Web/Mobile Client
├── backend/           # Express Server & DB Repositories
├── packages/
│   └── shared/        # Reconciliation logic & Types
├── docs/
│   ├── demo/          # Demo descriptions
│   └── PRD_COMPLIANCE.md # PRD Compliance Matrix
├── fixtures/          # Realistic validation payloads
├── README.md
├── .env.example
└── .gitignore
```

---

### 🚀 Setup & Execution

#### **1. Install Dependencies**
```bash
npm install
```

#### **2. Start the Backend**
Create `backend/.env` (using `backend/.env.example` as a template):
```bash
npm run start:backend
```

#### **3. Start the Web Client**
```bash
npm run web --workspace=@greenlink/mobile
```
Navigate to `http://localhost:8081` or `http://localhost:8082`.
