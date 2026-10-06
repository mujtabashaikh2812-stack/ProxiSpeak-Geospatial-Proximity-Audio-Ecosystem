# Infotact Solutions Internship - Work Distribution Document

**Project Name:** ProxiSpeak: Geospatial Proximity Audio Ecosystem  
**Organization:** Infotact-Group3  
**Cycle:** Month 1 - Project 1  
**Document Version:** 1.0  
**Submission Status:** Approved by Team Lead  

---

## 1. Team Directory

| # | Name | GitHub Username | Role Designation | Assigned Branch |
| :-: | :--- | :--- | :--- | :--- |
| **1** | **Mujtaba Shaikh** | Team Lead | Full-Stack Architect & Signaling Lead | `lead-mujtaba` |
| **2** | **Santosh Bhujbal** | `sitestock` | Spatial Database & Systems Engineer | `dev-santosh` |
| **3** | **Nedunuri Akhila** | `NedunuriAkhila1405` | 2D Canvas & Frontend UI Engineer | `dev-akhila` |
| **4** | **Kuldeep Behera** | `TBD` | WebRTC & Audio Processing Engineer | `dev-kuldeep` |

---

## 2. Module Ownership Matrix

| Module | Primary Owner | Secondary / Support | Key Deliverable |
| :--- | :--- | :--- | :--- |
| **2D Virtual World Engine** | Nedunuri Akhila | Mujtaba Shaikh | Canvas rendering, avatar animations, 60 FPS loop, keyboard inputs |
| **WebSocket Signaling** | Mujtaba Shaikh | Nedunuri Akhila | Real-time position broadcast, room events, WebRTC handshake |
| **Geospatial Proximity** | Santosh Bhujbal | Mujtaba Shaikh | MongoDB 2dsphere indexing, `$near` queries, Redis Pub/Sub scaling |
| **WebRTC & Spatial Audio** | Kuldeep Behera | Mujtaba Shaikh | Audio stream acquisition, Web Audio API gain/attenuation, 3D stereo panning |

---

## 3. Week-by-Week Breakdown

### Week 1: Foundation & Real-Time Coordinate Pipeline
* **Mujtaba Shaikh (`lead-mujtaba`):** Initialize project structure (client/server), configure Socket.io server, establish client-server connection handshake.
* **Nedunuri Akhila (`dev-akhila`):** Build HTML5 Canvas in React, draw grid map, render player avatar, implement WASD/Arrow key movement controls.
* **Santosh Bhujbal (`dev-santosh`):** Set up MongoDB connection, design User & Coordinates schema with GeoJSON Point representation and 2dsphere index.
* **Kuldeep Behera (`dev-kuldeep`):** Setup frontend audio permissions (`getUserMedia`), establish audio input testing UI and state indicators.

### Week 2: Spatial Filtering & WebRTC Integration
* **Santosh Bhujbal (`dev-santosh`):** Implement MongoDB `$near` & `$geoWithin` proximity queries to return users within a 100-pixel radius.
* **Mujtaba Shaikh (`lead-mujtaba`):** Connect proximity engine with Socket.io; selectively trigger WebRTC offer/answer handshakes only for nearby peers.
* **Kuldeep Behera (`dev-kuldeep`):** Implement WebRTC peer-to-peer connection logic, handle local and remote audio streams.
* **Nedunuri Akhila (`dev-akhila`):** Add visual proximity indicator rings (100px radius) around avatars and connection status badges.
* **🎯 Mid-Project Review Milestone Target:** Working 2-peer WebRTC voice call triggered dynamically by avatar proximity.

### Week 3: Mesh Scaling & Dynamic Audio Attenuation
* **Santosh Bhujbal (`dev-santosh`):** Set up Redis instance, implement Redis Pub/Sub adapter for Socket.io horizontal scaling.
* **Kuldeep Behera (`dev-kuldeep`):** Route incoming WebRTC audio into Web Audio API `AudioContext`, attach `GainNode` for linear/exponential volume drop-off.
* **Nedunuri Akhila (`dev-akhila`):** Optimize Canvas render loops with `requestAnimationFrame`, implement avatar name tags and speaking indicators.
* **Mujtaba Shaikh (`lead-mujtaba`):** End-to-end integration testing, mesh topology optimization, error handling for disconnected peers.

### Week 4: Spatial Polish, Obstacles & Deployment
* **Santosh Bhujbal (`dev-santosh`):** Create database models for persistent room layouts and acoustic obstacle boundaries (walls/doors).
* **Kuldeep Behera (`dev-kuldeep`):** Implement 3D stereo panning using `PannerNode` (panning sound left/right based on avatar relative X position).
* **Nedunuri Akhila (`dev-akhila`):** Render office furniture/walls on Canvas, implement wall collision detection and acoustic obstruction dampening.
* **Mujtaba Shaikh (`lead-mujtaba`):** Cloud deployment (Render/Vercel/Railway), final documentation, demo preparation, and viva readiness.
* **🎯 Final Project Review Milestone Target:** Complete working live deployment with 3D audio, obstacles, and multi-user performance.

---

## 4. SOP Compliance Statement
* All members agree to commit to their respective branches on a daily basis.
* Team Lead will review and merge PRs into `main` at the conclusion of each weekly sprint.
* Any member experiencing blockers must report within 24 hours to maintain team velocity.
