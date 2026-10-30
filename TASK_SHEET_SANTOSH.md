# Infotact Solutions Internship — Group 3
## Individual Sprint & Daily Commit Roadmap (Phase 2: Days 8–20)

**Assigned To:** Santosh Bhujbal  
**Role:** WebRTC & Audio Systems Engineer (Frontend Pod)  
**Dedicated Branch:** `dev-santosh`  
**Working Directory:** `vite-project/`  
**GitHub Repository:** `https://github.com/mujtabashaikh2812-stack/ProxiSpeak-Geospatial-Proximity-Audio-Ecosystem`  
**Supervisor / Team Lead:** Mujtaba Shaikh (`lead-mujtaba`)  
**Date Issued:** October 30, 2026  

---

### 🚨 CRITICAL URGENCY: SOP Streak & Disqualification Warning

> **Infotact SOP Rule 4.2:** Every intern must log **at least 1 meaningful commit per calendar day across 20 distinct days** on their dedicated branch to remain eligible for the internship stipend and final review certification.
>
> **Your Current Streak Status:** Your last commit on `origin/dev-santosh` was on **October 13 (`0ff585d`)**. You have been inactive on Git for **17 consecutive days** and have only approximately **4 out of 20 days** logged. You are currently in critical danger of dashboard disqualification.  
> You must resume committing **TODAY (October 30)** and push every single day without interruption through **November 11** to reach the 20-day milestone.

---

### 🎯 Your Phase 2 Mission & Architecture Overview

During Phase 1, you built our base Vite + React application, microphone acquisition (`UseMicrophone.js`), microphone HUD controls (`MicToogle.jsx`, `LevelMetter.jsx`), and initial audio math (`Distancevolume.js`, `Spitialpanner.js`).

In Phase 2 (Weeks 3 & 4), your mission is to transform these isolated audio components into a **fully connected, live WebRTC multi-peer spatial voice mesh**:
1. **Live Signaling Socket Bridge (`SignalingBridge.js`):** Connect your `RTCPeerConnection` handlers to Mujtaba's live Socket.io signaling events (`webrtc:offer`, `webrtc:answer`, `webrtc:ice`, `webrtc:hangup`).
2. **Multi-Peer Audio Mesh Coordinator (`MultiPeerCoordinator.js`):** Expand from 1-to-1 audio to managing up to 6 concurrent peer audio streams (`Map<peerId, { peerConnection, gainNode, pannerNode, stream }>`) respecting Mujtaba's dynamic mesh connection cap.
3. **Acoustic Low-Pass Wall Occlusion Filter (`WallFilter.js`):** When peers are separated by Conference Room Alpha's glass wall, route audio through a Web Audio `BiquadFilterNode` (~800Hz low-pass) so voice sounds realistically muffled.
4. **Hardware Device Selection & Audio DSP:** Add a microphone/headphone selector modal (`enumerateDevices`) and enable browser-native echo cancellation and background noise suppression.
5. **Stage Spotlight Amplification:** When someone speaks from the Town Hall Podium (`isOnStage === true`), bypass distance attenuation and amplify their voice at 100% volume.

---

### 📅 Day-by-Day Commit Schedule (Days 8 to 20)

Follow this exact schedule. Make sure each commit exceeds 50+ changed characters and contains working code and components.

```
┌──────┬────────┬────────────────────────────────────────────────────────────────────────┐
│ Day  │ Date   │ Deliverable Summary                                                    │
├──────┼────────┼────────────────────────────────────────────────────────────────────────┤
│ D08  │ Oct 30 │ Live Socket.io Signaling Relay Bridge (Offer, Answer, ICE Handlers)   │
│ D09  │ Oct 31 │ STUN Server Configuration & ICE Candidate Exchange Pipeline            │
│ D10  │ Nov 01 │ Multi-Peer WebRTC Mesh Coordinator (Concurrent 6-Peer Stream Map)      │
│ D11  │ Nov 02 │ Backend Mesh Capping & Demotion Event Listener (`mesh:update`)         │
│ D12  │ Nov 03 │ Acoustic Low-Pass Filter (`BiquadFilterNode`) for Wall Occlusion       │
│ D13  │ Nov 04 │ Hardware Device Selection Modal (Microphone & Speaker Dropdown)        │
│ D14  │ Nov 05 │ Browser Audio DSP Constraints (Echo Cancellation & Noise Suppression)  │
│ D15  │ Nov 06 │ Real-Time Audio Telemetry HUD (Bitrate, Packet Loss, and Ping Latency) │
│ D16  │ Nov 07 │ 3D HRTF Spatial Panning Linked to Avatar Facing Direction              │
│ D17  │ Nov 08 │ Town Hall Stage Podium VIP Volume Amplification & Broadcast Bypass     │
│ D18  │ Nov 09 │ Automated WebAudio GainNode Distance Attenuation Unit Test Harness     │
│ D19  │ Nov 10 │ Production WebRTC Spatial Audio Architecture Documentation Manual      │
│ D20  │ Nov 11 │ React Production Build Optimization, Bundle Audit, and v1.0.0 Tagging  │
└──────┴────────┴────────────────────────────────────────────────────────────────────────┘
```

---

### 🛠️ Detailed Implementation Guide by Day

#### 🔹 Day 8 (Oct 30 — TODAY): Live Signaling Socket Bridge
* **Task:** Create `src/Audio-section/webrtc/SignalingBridge.js`. Connect client Socket.io instance to Mujtaba's signaling backend:
  * Listen for `webrtc:offer`: Call `peerConnection.setRemoteDescription(new RTCSessionDescription(sdp))`, create answer, and emit `webrtc:answer`.
  * Listen for `webrtc:answer`: Call `peerConnection.setRemoteDescription(new RTCSessionDescription(sdp))`.
  * Listen for `webrtc:ice`: Call `peerConnection.addIceCandidate(new RTCIceCandidate(candidate))`.
  * Listen for `webrtc:peer-closed`: Disconnect audio nodes and close connection.
* **File to Create:** `src/Audio-section/webrtc/SignalingBridge.js`.
* **Commit Message:**
  ```bash
  git commit -m "feat(signaling): bind PeerManager to live Socket.io signaling events"
  ```

#### 🔹 Day 9 (Oct 31): STUN & ICE Candidate Exchange
* **Task:** Create `src/Audio-section/webrtc/iceConfig.js`:
  * Define standard Google public STUN servers:
    ```js
    export const rtcConfiguration = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
      ],
      iceCandidatePoolSize: 10,
    };
    ```
  * Handle `peerConnection.onicecandidate = (event) => { if (event.candidate) socket.emit('webrtc:ice', { to: peerId, candidate: event.candidate }); }`.
* **File to Create:** `src/Audio-section/webrtc/iceConfig.js`.
* **Commit Message:**
  ```bash
  git commit -m "feat(ice): configure Google STUN servers and ICE candidate exchange"
  ```

#### 🔹 Day 10 (Nov 01): Multi-Peer WebRTC Mesh Coordinator
* **Task:** Create `src/Audio-section/Mixer/MultiPeerCoordinator.js`:
  * Maintain active peer connections in a JavaScript `Map`:
    `activePeers = new Map<peerId, { pc, stream, gainNode, pannerNode, filterNode }>()`.
  * When a new peer enters earshot (`proximity:enter`), instantiate peer pipeline.
  * When a peer leaves (`proximity:leave`), disconnect audio nodes and remove from Map.
* **File to Create:** `src/Audio-section/Mixer/MultiPeerCoordinator.js`.
* **Commit Message:**
  ```bash
  git commit -m "feat(mesh): build multi-peer audio stream coordinator for mesh connections"
  ```

#### 🔹 Day 11 (Nov 02): Backend Mesh Capping & Demotion Handler
* **Task:** Integrate with Mujtaba's `meshManager`:
  * Listen to socket event `mesh:update`.
  * For any peer ID listed in `demoted`, gracefully mute their `GainNode.gain.setValueAtTime(0, audioCtx.currentTime + 0.2)` and close WebRTC track to save browser CPU.
  * For any peer ID in `promoted`, ramp up gain smoothly.
* **File to Create:** `src/Audio-section/webrtc/MeshCapHandler.js`.
* **Commit Message:**
  ```bash
  git commit -m "feat(mesh-cap): integrate backend mesh capping and demotion handler"
  ```

#### 🔹 Day 12 (Nov 03): Acoustic Low-Pass Filter for Wall Occlusion
* **Task:** Create `src/Audio-section/Mixer/WallFilter.js`:
  * Create `BiquadFilterNode` set to `type = 'lowpass'`.
  * Normal mode (open office): `filter.frequency.value = 20000` (transparent, full-spectrum).
  * Occluded mode (outside meeting room or through glass): ramp down `frequency.value = 800Hz` over 100ms.
  * Voice sounds realistically muffled through walls!
* **File to Create:** `src/Audio-section/Mixer/WallFilter.js`.
* **Commit Message:**
  ```bash
  git commit -m "feat(occlusion): implement low-pass BiquadFilterNode for wall sound dampening"
  ```

#### 🔹 Day 13 (Nov 04): Hardware Device Selection Modal
* **Task:** Create `src/Audio-section/Components/DeviceSelector.jsx`:
  * Queries `navigator.mediaDevices.enumerateDevices()`.
  * Populates dropdowns for Audio Input (Microphones) and Audio Output (Speakers/Headphones).
  * Switches active stream when user selects a different device without restarting the app.
* **File to Create:** `src/Audio-section/Components/DeviceSelector.jsx`.
* **Commit Message:**
  ```bash
  git commit -m "feat(devices): add microphone and speaker output selection modal"
  ```

#### 🔹 Day 14 (Nov 05): Browser Audio DSP Constraints
* **Task:** Create `src/Audio-section/AudioConstraints.js`:
  * Define optimal browser DSP media constraints:
    ```js
    export const AUDIO_CONSTRAINTS = {
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        sampleRate: 48000,
        channelCount: 1,
      },
      video: false,
    };
    ```
* **File to Create:** `src/Audio-section/AudioConstraints.js`.
* **Commit Message:**
  ```bash
  git commit -m "feat(audio-dsp): enable browser echo cancellation and noise suppression"
  ```

#### 🔹 Day 15 (Nov 06): Real-Time Audio Telemetry HUD
* **Task:** Create `src/Audio-section/Components/HUD/AudioStats.jsx`:
  * Calls `peerConnection.getStats()` every 2 seconds.
  * Calculates current audio bitrate (kbps), round-trip latency (RTT in ms), and packet loss percentage.
  * Displays a clean indicator pill: `🟢 24ms | 64 kbps | 0% loss`.
* **File to Create:** `src/Audio-section/Components/HUD/AudioStats.jsx`.
* **Commit Message:**
  ```bash
  git commit -m "feat(hud): add audio telemetry overlay for latency and packet loss"
  ```

#### 🔹 Day 16 (Nov 07): 3D HRTF Panning Linked to Avatar Direction
* **Task:** Create `src/Audio-section/Mixer/ListenerPosition.js`:
  * When Akhila's avatar turns or moves, pass avatar coordinate `(x, y)` and forward angle.
  * Set `pannerNode.positionX.value = (peer.x - me.x) / 50`, `positionZ.value = (peer.y - me.y) / 50`.
  * Creates realistic stereo sound: peers to your left speak in your left earphone, peers to your right in your right earphone.
* **File to Create:** `src/Audio-section/Mixer/ListenerPosition.js`.
* **Commit Message:**
  ```bash
  git commit -m "feat(spatial): bind 3D HRTF listener orientation to avatar facing direction"
  ```

#### 🔹 Day 17 (Nov 08): Town Hall Stage Podium Amplification
* **Task:** Create `src/Audio-section/Mixer/StageAmplifier.js`:
  * Listen for `spotlight:speaker_entered` and `peer.isOnStage === true`.
  * If a peer is on stage, bypass their distance attenuation and set `gainNode.gain.setValueAtTime(1.0, audioCtx.currentTime)`.
  * Everyone in the room hears the speaker loud and clear at 100% volume!
* **File to Create:** `src/Audio-section/Mixer/StageAmplifier.js`.
* **Commit Message:**
  ```bash
  git commit -m "feat(stage): implement spotlight podium volume amplification boost"
  ```

#### 🔹 Day 18 (Nov 09): Automated WebAudio Attenuation Unit Tests
* **Task:** Create `src/tests/audioMixer.test.js`:
  * Write test verifying `calculateVolume(distance)`:
    * Distance 0px -> 1.0 (100%)
    * Distance 50px -> 0.5 (50%)
    * Distance 95px -> 0.05 (5%)
    * Distance >= 100px -> 0.0 (muted)
* **File to Create:** `src/tests/audioMixer.test.js`.
* **Commit Message:**
  ```bash
  test(audio): build automated WebAudio GainNode attenuation test harness
  ```

#### 🔹 Day 19 (Nov 10): WebRTC Audio Pipeline Documentation
* **Task:** Create `WEBRTC_PIPELINE.md`:
  * Document the complete audio architecture: Browser Mic -> AudioContext -> BiquadFilter -> GainNode -> PannerNode -> RTCPeerConnection -> Remote Speakers.
* **File to Create:** `WEBRTC_PIPELINE.md`.
* **Commit Message:**
  ```bash
  git commit -m "docs: write WebRTC P2P audio pipeline architecture manual"
  ```

#### 🔹 Day 20 (Nov 11): Production Build & Bundle Audit
* **Task:** Run `npm run build` in `vite-project/`, verify clean zero-warning compilation, remove `console.log` statements, and tag release.
* **Commit Message:**
  ```bash
  git commit -m "chore: clean up React dependencies and prepare final audio demo build"
  ```

---

### 🚀 Daily Git Workflow (Commands to Run)

Run these commands inside your terminal every day:
```bash
# 1. Ensure you are on your dedicated branch
git checkout dev-santosh

# 2. Stage changes inside vite-project
git status
git add .

# 3. Commit with today's mandatory message (>50 characters)
git commit -m "feat(...): descriptive message for today"

# 4. Push to remote GitHub to record your daily streak
git push origin dev-santosh
```

> **Lead Support:** If you need help with Socket.io signaling payloads or WebAudio routing nodes, ping **Mujtaba** immediately. Let's make sure Day 8 is committed and pushed today!
