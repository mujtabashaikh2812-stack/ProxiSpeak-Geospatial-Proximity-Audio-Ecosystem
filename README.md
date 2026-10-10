# ProxiSpeak: Geospatial Proximity Audio Ecosystem

[![Status: In Development](https://img.shields.io/badge/Status-In%20Development-blue.svg)]()
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-v18%2B-brightgreen.svg)]()
[![React](https://img.shields.io/badge/React-18-61dafb.svg)]()

---

## 📌 Problem Statement
Remote collaboration tools (like Zoom or Google Meet) force users into rigid virtual "rooms" where only one person can speak at a time. They lack the spontaneous, spatial dynamics of a physical workplace where colleagues can hear conversations happening nearby, walk over naturally, and join organic discussions.

---

## 💡 Project Overview
**ProxiSpeak** is a real-time, spatial proximity audio ecosystem designed to restore spontaneous workplace dynamics in virtual environments. 

Users navigate an interactive 2D overhead virtual office rendered on an **HTML5 Canvas**. As participants move their avatars closer to each other, high-fidelity **WebRTC peer-to-peer audio** dynamically crossfades, scales in volume, and pans stereophonically across left and right audio channels. 

The **Node.js** backend continuously evaluates spatial relationships using **MongoDB Geospatial queries (`$near` & `$geoWithin`)**, orchestrating low-latency, organic audio networking for concurrent participants within the same virtual space.

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

## ⚙️ Core Technical Modules

### 1. 2D Virtual World Engine (React & HTML5 Canvas)
- High-performance, 60 FPS rendering pipeline for overhead office floorplans and avatar visualization.
- Smooth WASD and arrow-key movement interpolation with localized collision boundaries.

### 2. Real-Time Signaling Server (Node.js, Express & Socket.io)
- High-throughput WebSocket server managing peer state synchronization and coordinate streams.
- Orchestrates WebRTC peer-to-peer handshakes (SDP Offer/Answer exchanges and ICE candidate relays) exclusively for users within audio earshot.

### 3. Geospatial Proximity Engine (MongoDB `$near` & `$geoWithin`)
- Sub-20ms spatial query pipeline indexing coordinate locations using MongoDB `2dsphere` indexes.
- Dynamically clusters active participants and calculates dynamic interaction radiuses (100px proximity boundaries).

### 4. Spatial Audio Mixer (Web Audio API & WebRTC)
- In-browser real-time audio graph processing using `AudioContext`, `GainNode`, and `PannerNode`.
- Dynamic distance-based audio attenuation (volume roll-off) and 3D stereo panning (binaural sound cues).

---

## 🛠️ Technology Stack

| Layer | Technologies |
| :--- | :--- |
| **Frontend** | React, HTML5 Canvas API, Web Audio API, WebRTC (`getUserMedia`, `RTCPeerConnection`) |
| **Backend** | Node.js, Express, Socket.io |
| **Database & Cache** | MongoDB (Geospatial `$near`, `$geoWithin`, `2dsphere`), Redis (Pub/Sub Adapter) |
| **Networking & Protocols** | WebSockets (WSS), WebRTC (Mesh P2P Audio), REST APIs |

---

## 📅 4-Week Milestone Roadmap

### 🔹 Week 1: Movement & Signaling Foundation
* **Backend:** Build WebSocket server to broadcast avatar X/Y coordinates; configure MongoDB geospatial schemas.
* **Frontend:** Build the React Canvas layer; implement smooth keyboard avatar movement and coordinate broadcasting.

### 🔹 Week 2: Proximity Calculations & WebRTC Integration
* **Backend:** Implement MongoDB `$near` queries to group users; add logic to send WebRTC offer/answers only within a 100-pixel radius.
* **Frontend:** Implement standard WebRTC peer-to-peer audio connections using `getUserMedia`.
* **🎯 Mid-Project Review Milestone:** Verify backend spatial filtering under 20ms and demonstrate two browsers establishing a live WebRTC audio connection.

### 🔹 Week 3: Mesh Scaling & Dynamic Attenuation
* **Backend:** Optimize WebRTC mesh network; implement Redis Pub/Sub to scale Socket.io across server instances.
* **Frontend:** Hook WebRTC audio tracks into the Web Audio API; implement volume drop-off algorithms based on pixel distance.

### 🔹 Week 4: Spatial Audio Polish & Persistent Environments
* **Backend:** Save office layouts and sound-blocking furniture obstacles into MongoDB.
* **Frontend:** Add 3D audio panning (stereo separation) and ensure Canvas animations render at a steady 60 FPS.
* **🎯 Final Project Review Milestone:** A stateful geospatial server managing P2P routing paired with an immersive, physics-aware communication platform.

---

## 🚀 Getting Started

```bash
# Clone repository
git clone https://github.com/mujtabashaikh2812-stack/ProxiSpeak-Geospatial-Proximity-Audio-Ecosystem.git
cd ProxiSpeak-Geospatial-Proximity-Audio-Ecosystem
```
