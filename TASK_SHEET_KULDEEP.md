# Infotact Solutions Internship — Group 3
## Individual Sprint & Daily Commit Roadmap (Phase 2: Days 8–20)

**Assigned To:** Kuldeep Behera  
**Role:** Database & Geospatial Engineer (Backend Pod)  
**Dedicated Branch:** `dev-kuldeep`  
**GitHub Repository:** `https://github.com/mujtabashaikh2812-stack/ProxiSpeak-Geospatial-Proximity-Audio-Ecosystem`  
**Supervisor / Team Lead:** Mujtaba Shaikh (`lead-mujtaba`)  
**Date Issued:** October 30, 2026  

---

### ⚠️ URGENT: SOP Streak & Dashboard Compliance Alert

> **Infotact SOP Rule 4.2:** Every intern must log **at least 1 meaningful commit per calendar day across 20 distinct days** on their dedicated branch to remain eligible for the internship stipend and final review certification.
>
> **Your Current Streak Status:** Your last commit on `origin/dev-kuldeep` was on **October 26 (`3c6504c`)**. You currently have approximately **5 out of 20 days** logged. You must resume committing **TODAY (October 30)** and commit every single day through **November 11** to reach the 20-day milestone.

---

### 🎯 Your Phase 2 Mission & Architecture Overview

During Phase 1, you successfully established our MongoDB connection (`db.js`), the `User.js` schema with `2dsphere` spatial indexing, coordinate projection (`canvasToGeo.js`), and the sub-20ms spatial audit benchmark (`benchmark.js`).

In Phase 2 (Weeks 3 & 4), your mission is to transform our static database into a **production-grade, persistent spatial storage ecosystem**:
1. **Dynamic Office Zones (`OfficeZone.js`):** Move away from hardcoded meeting rooms by persisting Conference Room Alpha, Team Pods, and the Town Hall Stage as GeoJSON `Polygon` documents in MongoDB.
2. **REST API Endpoints:** Build Express routes allowing the frontend and signaling servers to fetch, update, and manage office zones dynamically.
3. **Session & Room Dwell-Time Analytics (`UserSession.js`):** Track user activity, login/logout timestamps, and room occupancy duration.
4. **Spatial Query Caching (`spatialCache.js`):** Implement in-memory TTL caching for `$near` lookups so stationary avatars don't overload MongoDB.
5. **Database Index Optimization & Load Testing:** Create compound indexes for online status filtering and benchmark 100 concurrent queries.

---

### 📅 Day-by-Day Commit Schedule (Days 8 to 20)

Follow this exact schedule. Make sure each commit exceeds 50+ changed characters and contains working code and tests.

```
┌──────┬────────┬────────────────────────────────────────────────────────────────────────┐
│ Day  │ Date   │ Deliverable Summary                                                    │
├──────┼────────┼────────────────────────────────────────────────────────────────────────┤
│ D08  │ Oct 30 │ OfficeZone GeoJSON Polygon Mongoose Model & Schema Validation          │
│ D09  │ Oct 31 │ Office Zone Seeder Script with Conference Room & Stage Polygons        │
│ D10  │ Nov 01 │ REST API Route: GET & POST /api/db/zones with Polygon Queries          │
│ D11  │ Nov 02 │ UserSession History Model for Room Occupancy & Dwell-Time Tracking    │
│ D12  │ Nov 03 │ In-Memory Spatial Cache Layer with 5-Second TTL for Stationary Peers   │
│ D13  │ Nov 04 │ Coordinate Boundary Sanitization Middleware (Anti-Corrupt Input Guard) │
│ D14  │ Nov 05 │ Docker Compose Orchestration for Standalone MongoDB Service            │
│ D15  │ Nov 06 │ Compound Spatial Index Migration: { status: 1, location: "2dsphere" } │
│ D16  │ Nov 07 │ High-Concurrency Load Testing Script for 100 Simultaneous Queries      │
│ D17  │ Nov 08 │ User Profile & Avatar Customization Persistence API                    │
│ D18  │ Nov 09 │ Database Architecture & Spatial Indexing Documentation                 │
│ D19  │ Nov 10 │ End-to-End Database Integration Test Harness                           │
│ D20  │ Nov 11 │ Final Code Cleanup, Dependency Audit, and v1.0.0 Release Tagging       │
└──────┴────────┴────────────────────────────────────────────────────────────────────────┘
```

---

### 🛠️ Detailed Implementation Guide by Day

#### 🔹 Day 8 (Oct 30 — TODAY): OfficeZone GeoJSON Model
* **Task:** Create `models/OfficeZone.js`. Define Mongoose schema with:
  * `zoneId` (String, unique, e.g. `'conference-alpha'`, `'stage-podium'`).
  * `name` (String, e.g. `'Conference Room Alpha'`).
  * `type` (String, enum: `['enclosed_room', 'spotlight_stage', 'open_workspace']`).
  * `isSoundproof` (Boolean, default: false).
  * `isSpotlightBroadcast` (Boolean, default: false).
  * `boundary`: GeoJSON Polygon geometry `{ type: { type: String, enum: ['Polygon'], default: 'Polygon' }, coordinates: [[[Number]]] }`.
  * Index: `boundary: '2dsphere'`.
* **File to Create:** `models/OfficeZone.js` and `tests/zoneModel.test.js`.
* **Commit Message:**
  ```bash
  git commit -m "feat(models): create OfficeZone schema with polygon GeoJSON coordinates"
  ```

#### 🔹 Day 9 (Oct 31): Office Zone Seeder Script
* **Task:** Create `scripts/seedZones.js` to seed default room polygons matching Akhila's canvas:
  * Conference Room Alpha: `[[ [60, 60], [340, 60], [340, 280], [60, 280], [60, 60] ]]`.
  * Town Hall Stage: `[[ [680, 80], [860, 80], [860, 200], [680, 200], [680, 80] ]]`.
  * Add verification check querying `OfficeZone.findOne({ boundary: { $geoIntersects: { $geometry: point } } })`.
* **File to Create:** `scripts/seedZones.js`.
* **Commit Message:**
  ```bash
  git commit -m "feat(seed): seed dynamic conference rooms and acoustic zones into MongoDB"
  ```

#### 🔹 Day 10 (Nov 01): REST API for Office Zones
* **Task:** Create `routes/zoneRoutes.js` and `controllers/zoneController.js`:
  * `GET /api/db/zones`: Returns all active office zones.
  * `GET /api/db/zones/containment?x=150&y=120`: Returns the exact zone containing the point using `$geoIntersects`.
  * `POST /api/db/zones`: Allows adding custom breakout rooms.
* **Files to Create:** `routes/zoneRoutes.js`, `controllers/zoneController.js`.
* **Commit Message:**
  ```bash
  git commit -m "feat(api): implement REST API endpoints for office zones and room layouts"
  ```

#### 🔹 Day 11 (Nov 02): UserSession & Room Dwell-Time Tracking
* **Task:** Create `models/UserSession.js`:
  * `userId`, `socketId`, `joinedAt`, `leftAt`, `totalDwellSeconds`.
  * `zonesVisited`: Array of `{ zoneId: String, enteredAt: Date, leftAt: Date }`.
  * Provide helper methods `recordZoneEntry(userId, zoneId)` and `recordZoneExit(userId, zoneId)`.
* **File to Create:** `models/UserSession.js`.
* **Commit Message:**
  ```bash
  git commit -m "feat(models): create UserSession history schema for dwell-time analytics"
  ```

#### 🔹 Day 12 (Nov 03): In-Memory Spatial Cache Layer
* **Task:** Create `services/spatialCache.js`:
  * Implements an in-memory TTL cache (e.g. 5-second lifetime) storing candidate `$near` query results keyed by `userId:floor(x/10):floor(y/10)`.
  * If a user hasn't moved significantly, returns cached nearby peers rather than hitting MongoDB.
  * Exports `getCachedNearby(userId)` and `setCachedNearby(userId, peers)`.
* **File to Create:** `services/spatialCache.js` and `tests/spatialCache.test.js`.
* **Commit Message:**
  ```bash
  git commit -m "feat(service): add spatial coordinate cache with TTL for stationary peers"
  ```

#### 🔹 Day 13 (Nov 04): Coordinate Boundary Sanitization Middleware
* **Task:** Create `middleware/validateCoordinates.js`:
  * Validates that coordinate inputs are valid numbers.
  * Clamps or rejects coordinates outside valid bounds (`x: 0–1200`, `y: 0–800`).
  * Prevents MongoDB `$near` crashes caused by `NaN`, `null`, or inverted longitudes/latitudes.
* **File to Create:** `middleware/validateCoordinates.js`.
* **Commit Message:**
  ```bash
  git commit -m "feat(validation): create coordinate boundary sanitization middleware"
  ```

#### 🔹 Day 14 (Nov 05): Docker Compose Database Orchestration
* **Task:** Create `docker-compose.mongo.yml`:
  * Defines MongoDB 7.0 container with persistent volume mounting and health checks.
  * Adds an optional seed runner container that executes `npm run seed` once MongoDB is healthy.
* **File to Create:** `docker-compose.mongo.yml`.
* **Commit Message:**
  ```bash
  git commit -m "feat(docker): create Docker Compose configuration for MongoDB replica set"
  ```

#### 🔹 Day 15 (Nov 06): Compound Spatial Index Migration
* **Task:** Create `scripts/migrateIndexes.js`:
  * Drops legacy single-field index.
  * Builds compound 2dsphere index: `{ "status": 1, "location": "2dsphere" }`.
  * Proves via `explain("executionStats")` that queries for `status: "online"` scan zero offline documents.
* **File to Create:** `scripts/migrateIndexes.js`.
* **Commit Message:**
  ```bash
  git commit -m "feat(indexes): add compound index for status and location queries"
  ```

#### 🔹 Day 16 (Nov 07): High-Concurrency Query Load Benchmark
* **Task:** Create `benchmark/loadTest.js`:
  * Spawns 100 concurrent asynchronous `$near` spatial queries simulating 100 moving avatars.
  * Collects min, max, mean, and p95 latency.
  * Asserts that p95 latency remains strictly under 20ms under heavy load.
* **File to Create:** `benchmark/loadTest.js`.
* **Commit Message:**
  ```bash
  test(load): build stress-testing script for 100 concurrent spatial queries
  ```

#### 🔹 Day 17 (Nov 08): User Profile & Customization Persistence
* **Task:** Create `routes/userRoutes.js`:
  * `PUT /api/db/users/:id/avatar`: Persists avatar color, shirt sprite ID, and custom status message into MongoDB.
  * `GET /api/db/users/:id`: Fetches saved user profile.
* **File to Create:** `routes/userRoutes.js`.
* **Commit Message:**
  ```bash
  git commit -m "feat(api): add user profile and avatar customization persistence endpoint"
  ```

#### 🔹 Day 18 (Nov 09): Database Architecture Documentation
* **Task:** Create `DATABASE_ARCHITECTURE.md`:
  * Document all Mongoose schemas (`User`, `OfficeZone`, `UserSession`).
  * Include ASCII ER diagrams, index descriptions, GeoJSON projection formulas, and performance benchmark summaries.
* **File to Create:** `DATABASE_ARCHITECTURE.md`.
* **Commit Message:**
  ```bash
  git commit -m "docs: publish database architecture and spatial query reference guide"
  ```

#### 🔹 Day 19 (Nov 10): End-to-End Database Integration Suite
* **Task:** Create `tests/e2eDatabase.test.js`:
  * Runs full automated integration cycle using Node test runner (`node --test tests/e2eDatabase.test.js`):
    1. Connect DB -> 2. Seed zones -> 3. Insert users -> 4. Run proximity query -> 5. Verify room containment -> 6. Cleanup.
* **File to Create:** `tests/e2eDatabase.test.js`.
* **Commit Message:**
  ```bash
  test(e2e): build full backend integration test harness
  ```

#### 🔹 Day 20 (Nov 11): Final Polish & v1.0.0 Release Tagging
* **Task:** Review `package.json`, update dependencies, clean up old logs, format code, and write final release notes in `CHANGELOG.md`.
* **Commit Message:**
  ```bash
  git commit -m "chore: finalize backend release v1.0.0 and audit report"
  ```

---

### 🚀 Daily Git Workflow (Commands to Run)

Run these commands on your terminal every day:
```bash
# 1. Ensure you are on your dedicated branch
git checkout dev-kuldeep

# 2. Check status and stage your changes
git status
git add .

# 3. Commit with today's mandatory message (>50 characters)
git commit -m "feat(...): descriptive message for today"

# 4. Push to remote GitHub to record your daily streak
git push origin dev-kuldeep
```

> **Lead Support:** If you encounter any issues connecting to MongoDB, integrating with the Express server, or structuring your GeoJSON polygons, message **Mujtaba** immediately. Let's get Day 8 committed today!
