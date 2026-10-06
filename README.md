# ProxiSpeak: Geospatial Proximity Audio Ecosystem

[![Infotact Solutions Internship](https://img.shields.io/badge/Internship-Infotact%20Solutions-blue.svg)](https://infotact.in)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Status: In Development](https://img.shields.io/badge/Phase-Week%201%20Implementation-orange.svg)]()

## 📌 Project Overview
**ProxiSpeak** is a real-time, spatial proximity-based audio communication platform for remote teams. Traditional meeting tools (such as Zoom or Teams) trap participants in rigid, single-speaker virtual rooms that lack the organic spatial dynamics of physical workplaces.

ProxiSpeak bridges this gap by rendering a 2D overhead virtual office map on an HTML5 Canvas. As users move their avatars closer to colleagues, WebRTC audio dynamically crossfades and amplifies based on real-time geospatial proximity calculated via MongoDB and WebSockets.

---

## 👥 Team & Work Distribution

| Member | Role | Primary Focus Area | Branch Name |
| :--- | :--- | :--- | :--- |
| **Mujtaba Shaikh** (Lead) | Team Lead & Signaling Architect | Architecture, WebSockets, WebRTC Signaling & Integration | `lead-mujtaba` |
| **Santosh Bhujbal** (`sitestock`) | Spatial & Database Engineer | MongoDB Geospatial Engine (`$near`, `$geoWithin`), Redis Pub/Sub | `dev-santosh` |
| **Nedunuri Akhila** (`NedunuriAkhila1405`) | 2D Canvas & Frontend Engineer | React, HTML5 Canvas Rendering, Keyboard/WASD Movement | `dev-akhila` |
| **Kuldeep Behera** | Audio & WebRTC Engineer | WebRTC P2P Audio Streaming, Web Audio API Attenuation & 3D Panning | `dev-kuldeep` |

---

## 🏛️ System Architecture

```text
       ┌────────────────────────────────────────────────────────┐
       │                   Client Browser                       │
       │  ┌───────────────────────┐  ┌───────────────────────┐  │
       │  │  React + Canvas API   │  │    Web Audio API      │  │
       │  │ (2D World & Avatars)  │  │ (3D Spatial Panning)  │  │
       │  └───────────▲───────────┘  └───────────▲───────────┘  │
       └──────────────┼──────────────────────────┼──────────────┘
                      │ Movements & Events       │ WebRTC P2P Audio
                      ▼                          ▼
       ┌──────────────────────────┐    ┌─────────────────────────┐
       │ Node.js Signaling Server │    │ Remote Peer Browser(s)  │
       │       (Socket.io)        │    │ (Direct Voice Stream)   │
       └──────────────┬───────────┘    └─────────────────────────┘
                      │
         ┌────────────┴────────────┐
         ▼                         ▼
┌──────────────────┐     ┌──────────────────┐
│ MongoDB GeoEngine│     │  Redis Pub/Sub   │
│ ($near Queries)  │     │ (Mesh Scaler)    │
└──────────────────┘     └──────────────────┘
```

---

## 🚀 Key Modules
1. **2D Virtual World (React & HTML5 Canvas)**: Smooth, 60 FPS overhead virtual office rendering with interactive user avatars and collision boundaries.
2. **Signaling Server (Node.js & Socket.io)**: High-throughput event pipeline orchestrating coordinate synchronization and WebRTC handshake signaling.
3. **Geospatial Proximity Engine (MongoDB `$near`)**: Sub-20ms spatial clustering engine calculating dynamic audio earshot boundaries (100px radius).
4. **Spatial Audio Mixer (Web Audio API & WebRTC)**: Real-time peer audio manipulation adjusting volume drop-off (attenuation) and stereo separation based on relative avatar coordinates.

---

## 📅 4-Week Milestone Roadmap

### 🔹 Week 1: Signaling & Movement Foundation
- **Backend:** WebSocket server to broadcast avatar (X, Y) coordinates; MongoDB schema setup with 2dsphere indexes.
- **Frontend:** HTML5 Canvas layer in React; smooth keyboard (WASD / Arrow) navigation; real-time coordinate emit pipeline.

### 🔹 Week 2: Proximity Filtering & WebRTC Handshake
- **Backend:** MongoDB `$near` queries; selective WebRTC signaling limited to peers within a 100-pixel radius.
- **Frontend:** Peer-to-peer WebRTC audio connection via `getUserMedia` and signaling exchanges.
- **🎯 Mid-Project Review Deliverable:** Spatial audit (<20ms query response) & 2-peer live WebRTC voice demo.

### 🔹 Week 3: Mesh Scaling & Dynamic Attenuation
- **Backend:** Redis Pub/Sub integration to scale Socket.io across multiple Node instances.
- **Frontend:** Web Audio API integration with `GainNode` for continuous distance-based volume roll-off.

### 🔹 Week 4: Spatial Polish & Obstacles
- **Backend:** Persistent office room layouts and sound-dampening obstacle storage.
- **Frontend:** Web Audio `PannerNode` for 3D stereo panning (left/right ear dynamics) at steady 60 FPS.
- **🎯 Final Review Deliverable:** Fully deployed working demonstration with viva presentation.

---

## 🌿 Git Branching Strategy & Contribution Guidelines
In accordance with Infotact SOP guidelines:
1. `main`: Production/Demo-ready code. Merges performed exclusively by the **Team Lead**.
2. **Individual Branches:** Each member commits strictly to their designated branch (`lead-mujtaba`, `dev-santosh`, `dev-akhila`, `dev-kuldeep`).
3. **Commit Discipline:** All members maintain continuous daily commit logs reflecting meaningful progress.

---

## ⚙️ Getting Started (Local Setup)

```bash
# Clone the repository
git clone https://github.com/Infotact-Group3/ProxiSpeak-Geospatial-Proximity-Audio-Ecosystem.git
cd ProxiSpeak-Geospatial-Proximity-Audio-Ecosystem

# Switch to your personal branch
git checkout <your-branch-name>
```
