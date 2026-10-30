# ProxiSpeak: Geospatial Proximity Audio Ecosystem
## Mid-Project Review — 5-Minute Spoken Script & Presentation Guide

**Date:** October 29, 2026 (Phase 1 Mid-Review)  
**Speaker:** Mujtaba Shaikh  
**Role:** Team Lead & Signaling Architect (Group 3)  
**Branch:** `lead-mujtaba`  
**Repository:** `https://github.com/mujtabashaikh2812-stack/ProxiSpeak-Geospatial-Proximity-Audio-Ecosystem.git`  
**Total Target Time:** 4 Minutes 30 Seconds to 5 Minutes  

---

## ⏱️ Executive Time Budget

| Minute Range | Presentation Section | Key Focus |
|:---|:---|:---|
| **0:00 – 1:00** | Introduction & Problem Statement | Team introduction, remote meeting fatigue, physical spatial audio concept |
| **1:00 – 2:00** | Architecture & 2–2 Pod Division | Pod 1 (Frontend: Akhila & Santosh) vs. Pod 2 (Backend: Mujtaba & Kuldeep) |
| **2:00 – 3:15** | Personal Technical Deep-Dive | Signaling server, proximity math, acoustic zones, 30Hz throttle & Redis scaling |
| **3:15 – 4:15** | Mid-Review Milestones & Live Proof | MongoDB <20ms audit, 2-peer WebRTC voice, 2D canvas, 28/28 unit tests |
| **4:15 – 5:00** | Phase 2 Roadmap & Conclusion | Mesh connection capping, wall occlusion filters, cloud deployment |

---

## 🎙️ Word-for-Word Spoken Script

### 🔹 Minute 1: Welcome, Team Introduction & The Problem (0:00 – 1:00)

*(Start calmly, make eye contact, smile, and speak at an even, steady pace)*

> "Good afternoon, respected mentors and evaluators.
>
> My name is **Mujtaba Shaikh**, and I am the **Team Lead of Group 3**. Today, on behalf of my team, I am proud to present our mid-project review for **ProxiSpeak: A Geospatial Proximity Audio Ecosystem**.
>
> To begin, I would like to introduce our four-member team:
> * In the **Backend Pod**: myself, **Mujtaba Shaikh**, serving as Team Lead and Signaling Architect, and **Kuldeep Behera**, our Database and Geospatial Engineer.
> * In the **Frontend Pod**: **Santosh Bhujbal**, our WebRTC and Audio Systems Engineer, and **Nedunuri Akhila**, our 2D Canvas and UI Interaction Engineer.
>
> The problem we set out to solve is the unnatural, exhausting nature of traditional video calls like Zoom or Teams. In those platforms, everyone is packed into a single, flat audio room where only one person can talk at a time.
>
> With **ProxiSpeak**, we are recreating the natural acoustic dynamics of a physical office on a 2D interactive canvas:
> * When your avatar walks closer to a colleague, their voice naturally gets louder.
> * When you walk away, their voice smoothly fades out.
> * When you enter an enclosed glass meeting room, outside noise is completely blocked.
> * And when someone steps onto the Town Hall Stage Podium, their voice is broadcast to the entire office."

---

### 🔹 Minute 2: System Architecture & The 2–2 Pod Model (1:00 – 2:00)

> "To ensure disciplined Git workflows, avoid merge conflicts, and meet our daily commit requirements, I structured our development into a strict **2–2 Pod Architecture**:
>
> **1. The Frontend Pod (Akhila & Santosh):**
> * **Akhila** built our 60 FPS HTML5 Canvas engine. She designed the office layout, desk clusters, avatar rendering with WASD controls, and a dynamic 100-pixel visual proximity circle.
> * **Santosh** implemented browser microphone acquisition and Web Audio API spatialization, using `GainNode` for distance-based volume falloff and `PannerNode` for 3D stereo panning.
>
> **2. The Backend Pod (Kuldeep & Myself):**
> * **Kuldeep** implemented our MongoDB database using GeoJSON `Point` schemas and `2dsphere` spatial indexing. He verified that geospatial candidate queries execute in **under 20 milliseconds**, fulfilling our primary database audit benchmark.
> * On my personal branch, **`lead-mujtaba`**, I engineered the real-time Socket.io signaling backbone, the spatial proximity calculation engine, acoustic zone barriers, and our horizontal scaling pipeline."

---

### 🔹 Minute 3: Personal Technical Contributions on `lead-mujtaba` (2:00 – 3:15)

> "Now, diving deeper into my personal engineering contributions as Lead & Signaling Architect:
>
> **1. Real-Time WebRTC Signaling Server:**  
> WebRTC peers cannot connect on their own without an initial handshake. Using Node.js, Express, and Socket.io, I built the signaling relay handlers that negotiate SDP Offers, SDP Answers, and ICE network candidates between browsers.
>
> **2. Geospatial Proximity State Engine:**  
> As players move, my backend continuously computes 2D Euclidean distance in real-time. I implemented an automatic proximity state machine that dispatches three core events:
> * `proximity:enter` when two avatars cross within the 100-pixel earshot radius,
> * `proximity:update` to smoothly adjust volume as distance changes, and
> * `proximity:leave` to gracefully disconnect audio when players step apart.
>
> **3. Virtual Office Acoustic Zones:**  
> Real offices have walls and stages. I developed `zoneManager.js`, which enforces two major acoustic rules:
> * **Conference Room Alpha:** A soundproof glass meeting room that isolates conversations inside from peers outside in the hallway.
> * **Town Hall Stage & Podium:** An executive presentation area where anyone stepping on the podium automatically receives 100% volume global broadcast across the whole room.
>
> **4. 30Hz Movement Throttling & Redis Horizontal Scaling:**  
> Fast avatar movement can spam 60 to 120 coordinate packets per second. I built a 30Hz rate-limiting and delta-compression engine that suppresses sub-pixel jitter, reducing network bandwidth overhead by over 40%.  
> Furthermore, I built our **Socket.io Redis Cluster Adapter**, allowing multiple backend servers to synchronize player movements and WebRTC voice calls across instances with zero downtime."

---

### 🔹 Minute 4: Mid-Review Deliverables & Quality Assurance (3:15 – 4:15)

> "For this Phase 1 Mid-Review, our rulebook specified three mandatory technical deliverables, and our team has achieved all three:
>
> 1. ✅ **MongoDB Spatial Query Audit Under 20ms:** Successfully verified with indexed `$near` queries.
> 2. ✅ **2-Peer WebRTC Audio Handshake:** Successfully established between two browser clients via my signaling relay.
> 3. ✅ **2D Canvas Avatar Movement:** Fully interactive with WASD keys, boundary collision clamping, and proximity circles.
>
> On my branch, I have also maintained high engineering standards by building an automated test suite:
> * We currently have **28 out of 28 unit tests passing** (100% pass rate) via Node's native test runner (`node --test`).
> * Our tests validate 2D Euclidean math, room soundproofing, stage speaker spotlighting, 30Hz coordinate throttling, and multi-instance Redis pub/sub messaging.
>
> All team responsibilities, branch mappings, and sprint schedules are formally documented in our repo's `WORK_DISTRIBUTION.md`."

---

### 🔹 Minute 5: Phase 2 Roadmap & Conclusion (4:15 – 5:00)

> "Looking ahead to Phase 2 (Weeks 3 and 4), our roadmap focuses on production hardening and optimization:
>
> * **Mesh Connection Capping:** Dynamically limiting active audio connections to the top 6 closest peers so browser CPU never lags in crowded spaces.
> * **Acoustic Raycasting Occlusion:** Simulating realistic sound dampening through office furniture and walls.
> * **Cloud Containerization:** Packaging our Node server, Redis, and MongoDB with Docker Compose for live cloud deployment.
>
> In summary, Group 3 has delivered a functional, low-latency, and well-tested geospatial audio platform. We are on schedule, maintaining our daily Git streak, and ready for Phase 2.
>
> Thank you, mentors. I am now open to your feedback and questions."

---

---

## 🧠 Mentor Q&A Cheat Sheet (Instant Answers)

Keep these answers in mind if the evaluators ask technical follow-up questions:

### Q1: *"What is the difference between WebSockets and WebRTC in your project?"*
> **Answer:**  
> *"We use Socket.io (WebSocket) for low-bandwidth coordination — like player coordinates (x, y) and the initial WebRTC connection handshake (Offer, Answer, ICE).  
> We use WebRTC for the actual peer-to-peer audio stream so our server doesn't carry heavy voice traffic."*

### Q2: *"How does your proximity math work?"*
> **Answer:**  
> *"We compute 2D Euclidean distance: $\text{distance} = \sqrt{(x_2 - x_1)^2 + (y_2 - y_1)^2}$.  
> If distance is $\le 100\text{px}$, the peers enter proximity and volume scales inversely ($1 - \frac{\text{dist}}{100}$). If distance exceeds $100\text{px}$, the audio connection closes."*

### Q3: *"What is Redis and why did you introduce it?"*
> **Answer:**  
> *"Redis is an ultra-fast, in-memory data store running in RAM. In ProxiSpeak, we use Redis Pub/Sub as our inter-server message bus. When multiple backend server instances are running to handle heavy user traffic, Redis allows them to synchronize player coordinates and WebRTC audio signals instantly across servers in real-time."*

### Q4: *"What if Redis is not installed on the evaluator's computer?"*
> **Answer:**  
> *"Our Redis module (`redisClient.js`) contains an intelligent `InMemoryRedisMock` fallback. If real Redis is absent, our server automatically switches to an internal memory bus with zero crashes, ensuring local review demos run flawlessly."*

### Q5: *"How does Conference Room Alpha block sound?"*
> **Answer:**  
> *"Our `zoneManager.js` checks avatar coordinates against rectangular bounding boxes. If Peer A is inside the conference room and Peer B is in the open office, the acoustic engine blocks the audio signal (effective volume = 0), even if they are only 10 pixels apart across the glass wall."*

### Q6: *"How did you verify the under-20ms MongoDB spatial audit?"*
> **Answer:**  
> *"Kuldeep created a dedicated benchmark script (`benchmark.js`) that seeds realistic office coordinates with a MongoDB `2dsphere` index and measures the `$near` geospatial lookup latency, which consistently executes in well under 20 milliseconds."*

---

## 🖥️ Live Demo Quick Checklist (If Asked to Show Code/App)

1. **Terminal 1 — Run Unit Tests:**
   ```bash
   npm test
   ```
   *Expected outcome:* **28 tests passing (100%)** in ~2 seconds.

2. **Terminal 2 — Start Backend Server:**
   ```bash
   node server.js
   ```
   *Expected outcome:* Server starts on port 5000 with visual playground on `http://localhost:5000`.

3. **Browser — Check Live Endpoints:**
   * `http://localhost:5000/api/health` — Shows active peers and uptime.
   * `http://localhost:5000/api/health/redis` — Shows Redis health and fallback guarantee.
   * `http://localhost:5000/api/cluster/status` — Shows multi-instance cluster status.
   * `http://localhost:5000/api/performance/throttle` — Shows 30Hz bandwidth reduction stats.
