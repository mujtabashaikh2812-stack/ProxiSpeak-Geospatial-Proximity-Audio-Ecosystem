# Infotact Solutions Internship - Work Distribution Document

**Project Title:** ProxiSpeak: Geospatial Proximity Audio Ecosystem  
**Repository:** [mujtabashaikh2812-stack/ProxiSpeak-Geospatial-Proximity-Audio-Ecosystem](https://github.com/mujtabashaikh2812-stack/ProxiSpeak-Geospatial-Proximity-Audio-Ecosystem)  
**Cycle:** Month 1 - Project 1 (October 2026)  
**Document Version:** 2.0 (Post-Sprint Review Alignment)  
**Submission Status:** Approved by Team Lead for Mid-Project Review Evaluation  

---

## 1. Executive Team Directory & Branch Ownership

In strict compliance with **Infotact SOP Section 4.2 & 4.3**, every team member operates on a designated Git branch. All production merges into `main` are authorized and performed exclusively by the Team Lead.

| # | Member Name | Role & Specialization | Sub-Team Pod | Dedicated Branch | GitHub Handle |
| :-: | :--- | :--- | :--- | :--- | :--- |
| **1** | **Mujtaba Shaikh** | **Team Lead & Signaling Architect** | Backend Lead | `lead-mujtaba` | `@mujtabashaikh2812-stack` |
| **2** | **Kuldeep Behera** | **Geospatial & Database Engineer** | Backend Core | `dev-kuldeep` | `@kuldeep_behera` |
| **3** | **Santosh Bhujbal** | **WebRTC & Audio Systems Engineer** | Frontend Core | `dev-santosh` | `@sitestock` |
| **4** | **Nedunuri Akhila** | **2D Canvas & UI Interaction Engineer** | Frontend Lead | `dev-akhila` | `@NedunuriAkhila1405` |

---

## 2. 2–2 Architectural Sub-Team Split

To maximize velocity, eliminate merge conflicts, and enforce modular separation of concerns, development is partitioned into two specialized 2-member execution pods:

```
┌────────────────────────────────────────────────────────┐
│             PROXISPEAK ARCHITECTURAL PODS              │
├───────────────────────────┬────────────────────────────┤
│       FRONTEND POD        │        BACKEND POD         │
├─────────────┬─────────────┼──────────────┬─────────────┤
│   Akhila    │   Santosh   │   Mujtaba    │   Kuldeep   │
│ (2D Canvas) │  (WebRTC &  │ (Signaling & │ (MongoDB &  │
│             │ Web Audio)  │ Proximity)   │ Spatial DB) │
└─────────────┴─────────────┴──────────────┴─────────────┘
```

### Module Responsibilities:
1. **Frontend Pod (Akhila & Santosh):**
   * **Akhila:** 2D Virtual Office Canvas world, player sprite rendering, WASD/Arrow navigation, Conference Room Alpha, Town Hall Stage, and proximity radius visualization.
   * **Santosh:** Browser media streaming (`getUserMedia`), WebRTC `RTCPeerConnection` mesh management, distance volume attenuation (`GainNode`), and 3D HRTF stereo panning (`PannerNode`).
2. **Backend Pod (Mujtaba & Kuldeep):**
   * **Mujtaba (Lead):** Express HTTP server, Socket.io coordinate streaming pipeline, WebRTC signaling relay (Offer/Answer/ICE), real-time acoustic zone engine (`zoneManager.js`), and server deployment.
   * **Kuldeep:** MongoDB GeoJSON `Point` schemas, `2dsphere` spatial indexing, `$near` candidate queries, and sub-20ms spatial audit benchmarking (`benchmark.js`).

---

## 3. Detailed Week-by-Week Implementation Schedule

### 🔹 WEEK 1: Core Scaffolding, Movement & Schemas
* **Mujtaba Shaikh (`lead-mujtaba`):**
  * Scaffold Express server with dynamic CORS, environment configs, and health-check API (`/api/health`).
  * Initialize Socket.io lifecycle engine with active peer session registry.
  * Implement `player:move` event listener and coordinate broadcasting.
* **Kuldeep Behera (`dev-kuldeep`):**
  * Configure Mongoose connection with fallback connection pooling (`db.js`).
  * Build `User` schema with strict GeoJSON `Point` coordinates and `2dsphere` spatial index.
  * Develop database seeding utility (`seed.js`) with mock office coordinates.
* **Santosh Bhujbal (`dev-santosh`):**
  * Scaffold client application with Vite and React.
  * Implement browser microphone acquisition hook (`UseMicrophone.js`) with permission guards.
  * Build HUD overlay for microphone mute/unmute and live input audio level meter.
* **Nedunuri Akhila (`dev-akhila`):**
  * Build HTML5 Canvas rendering engine with `requestAnimationFrame` 60 FPS loop.
  * Implement WASD and arrow-key avatar movement with canvas boundary collision clamping.
  * Draw initial office room layout with desks and team workstations.

---

### 🔹 WEEK 2: Proximity Gating, Spatial Audit & WebRTC Voice
*🎯 **Mid-Project Review Milestone Target: Spatial Audit (< 20ms) & 2-Peer Live WebRTC Audio***
* **Kuldeep Behera (`dev-kuldeep`):**
  * Implement MongoDB `$near` query service with candidate distance margins (`proximityService.js`).
  * Build `canvasToGeo.js` coordinate projection utility mapping canvas pixels to GeoJSON coordinates.
  * Execute high-precision latency benchmarks (`benchmark.js`) proving query execution in **under 20ms**.
  * Author integration contract (`INTEGRATION_CONTRACT.md`) defining shared data schemas.
* **Mujtaba Shaikh (`lead-mujtaba`):**
  * Implement WebRTC signaling relay handlers (`webrtc:offer`, `webrtc:answer`, `webrtc:ice`, `webrtc:hangup`).
  * Build real-time Proximity Engine (`services/spatialEngine.js`) calculating 2D Euclidean earshot boundaries.
  * Enforce 100px proximity-gating on WebRTC handshakes (`webrtc:out-of-range` rejection).
  * Build virtual office acoustic zones: Conference Room Alpha (soundproof) and Town Hall Stage (broadcast).
  * Implement and verify 11/11 automated unit tests (`node --test`).
* **Santosh Bhujbal (`dev-santosh`):**
  * Implement WebRTC `RTCPeerConnection` mesh manager (`PeerManger.js`) with Google STUN servers.
  * Build distance-based audio attenuation algorithm (`Distancevolume.js`) scaling volume from 100% to 10%.
  * Create Web Audio API `PannerNode` wrapper with HRTF spatial separation.
* **Nedunuri Akhila (`dev-akhila`):**
  * Render dynamic 100px dashed proximity circle around active user avatar.
  * Add visual indicators for Conference Room Alpha and golden Town Hall Podium.
  * Display live coworker sidebar list with proximity distance and audio volume badges.

---

### 🔹 WEEK 3: Mesh Scaling, Performance & Attenuation Polish
* **Mujtaba Shaikh (`lead-mujtaba`):**
  * Integrate `@socket.io/redis-adapter` and Redis Pub/Sub for horizontal multi-instance scaling.
  * Implement coordinate emit rate limiting (throttling movement broadcasts to 30Hz to conserve network bandwidth).
  * Build mesh connection caps to prevent browser CPU overload when > 10 peers converge.
* **Santosh Bhujbal (`dev-santosh`):**
  * Route incoming WebRTC audio streams into Web Audio API `AudioContext`.
  * Connect `GainNode` for real-time exponential volume roll-off based on live distance deltas.
  * Add acoustic occlusion dampening if avatars are separated by office furniture or glass barriers.
* **Kuldeep Behera (`dev-kuldeep`):**
  * Implement Redis caching layer for high-frequency coordinate lookups.
  * Construct `$geoWithin` polygon queries for multi-room grouping.
  * Implement automated cleanup cron/watchdog for pruning stale database sessions.
* **Nedunuri Akhila (`dev-akhila`):**
  * Optimize Canvas rendering pipeline with coordinate linear interpolation (lerp) for smooth motion.
  * Add speaking visual pulse auras and direction-facing sprite indicators.
  * Implement responsive canvas auto-resizing across different monitor viewports.

---

### 🔹 WEEK 4: Persistent Layouts, Security Hardening & Cloud Deployment
*🎯 **Final Project Review Milestone Target: Production Deployment & Physics-Aware Spatial Audio***
* **Mujtaba Shaikh (`lead-mujtaba`):**
  * Production security hardening: Helmet security headers, Express rate limiting, and strict CORS validation.
  * Containerize backend server with production multi-stage Dockerfile.
  * Deploy live signaling server to cloud hosting (Render / Railway).
  * Orchestrate final end-to-end integration and lead technical viva presentation.
* **Kuldeep Behera (`dev-kuldeep`):**
  * Develop MongoDB models for persistent office layouts, custom furniture, and sound-blocking barriers.
  * Create REST API endpoints: `GET /api/office/layout` and `POST /api/office/obstacles`.
  * Deploy and configure MongoDB Atlas production cloud cluster.
* **Santosh Bhujbal (`dev-santosh`):**
  * Final audio calibration for binaural headphone 3D sound separation.
  * Audio fallback handling for browsers restricting autoplay policies.
  * Assist in final live demonstration rehearsal.
* **Nedunuri Akhila (`dev-akhila`):**
  * Render custom office furniture tiles, meeting room glass doors, and ambient office assets.
  * Final UI styling polish, responsive HUD overlay, and cross-browser testing.

---

## 4. Deliverable Review Verification Matrix

| Review Stage | Target Deliverables | Responsible Members | Status |
| :--- | :--- | :--- | :---: |
| **Mid-Project Review** | • Sub-20ms MongoDB Spatial Audit<br>• Real-time Socket.io coordinate broadcasting<br>• 2-browser WebRTC audio connection demo<br>• Interactive 2D Canvas with Room & Podium zones | All Team Members | **READY (65% Complete)** |
| **Final Project Review** | • Cloud-deployed multi-user application<br>• Redis Pub/Sub cluster scaling<br>• 3D HRTF binaural stereo panning & wall occlusion<br>• Persistent custom office floorplans & Viva defense | All Team Members | Scheduled for Weeks 3–4 |

---

## 5. SOP Compliance & Governance Statement

1. **Daily Commit Discipline:** All team members agree to push at least one valid, meaningful commit (> 50 changed characters) to their dedicated branches daily.
2. **Branch Isolation:** No direct commits to `main` are permitted. All features must be developed on personal branches and merged through Pull Requests approved by the Team Lead.
3. **Escalation SLA:** Any technical blockers or unresponsive team members (> 24 hours) are reported to the Team Lead and Infotact Solutions mentors per Section 7 of the SOP.

---

**Approved and Submitted by:**  
*Mujtaba Shaikh — Team Lead, Infotact Group 3*
