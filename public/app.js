/**
 * ProxiSpeak Full-Stack Interactive Virtual Office Playground Client
 * 
 * Features:
 * 1. 2D Canvas rendering with 60 FPS lerp coordinate interpolation.
 * 2. Multi-Zone acoustic boundaries & persistent obstacles from backend REST API.
 * 3. Physics-aware acoustic raycasting line-of-sight vectors.
 * 4. Real-time room occupancy headcounts and capacity metrics.
 * 5. Sub-50ms Network QoS latency RTT ping diagnostics.
 * 6. Town Hall Stage Podium VIP broadcast alert banner.
 * 7. Modern glassmorphism UI & architectural CAD-style blueprint assets.
 */

(function () {
  'use strict';

  const canvas = document.getElementById('worldCanvas');
  const ctx = canvas.getContext('2d');

  // DOM Elements
  const zoneLabel = document.getElementById('current-zone-label');
  const coordsLabel = document.getElementById('coords-label');
  const peersCountLabel = document.getElementById('peers-count-label');
  const pingLabel = document.getElementById('ping-label');
  const audibleList = document.getElementById('audible-peers-list');
  const occupancyList = document.getElementById('occupancy-list');
  const eventLog = document.getElementById('event-log');
  const spotlightBanner = document.getElementById('spotlight-banner');
  const muteBtn = document.getElementById('mute-toggle-btn');
  const benchBtn = document.getElementById('run-benchmark-btn');
  const benchOpsLabel = document.getElementById('bench-ops-label');
  const benchStatusLabel = document.getElementById('bench-status-label');

  // World and Layout Configuration
  let activeLayout = {
    dimensions: { width: 1200, height: 800 },
    zones: [],
    obstacles: [],
    furniture: [],
  };
  let earshotRadius = 100;

  // Local Avatar State
  const myUserId = 'user-' + Math.floor(1000 + Math.random() * 9000);
  const myDisplayName = 'Player-' + myUserId.slice(5);
  const myAvatar = {
    userId: myUserId,
    displayName: myDisplayName,
    x: 420,
    y: 360,
    targetX: 420,
    targetY: 360,
    radius: 15,
    color: '#38bdf8',
    speed: 4.5,
    zone: 'open-office',
    zoneName: 'Open Workspace',
    isMuted: false,
    isOnStage: false,
  };

  // Remote Peers Registry: Map<userId, PeerObject>
  const remotePeers = new Map();

  // Active Proximity Audible Set: Map<peerId, { distance, mode, effectiveVolume, pan }>
  const audiblePeers = new Map();

  // Socket Connection
  const socket = io();

  // Resize canvas to fill viewport container
  function resizeCanvas() {
    canvas.width = canvas.parentElement.clientWidth;
    canvas.height = canvas.parentElement.clientHeight;
  }
  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();

  // Log events to sidebar terminal
  function logEvent(msg, color = '#cbd5e1') {
    if (!eventLog) return;
    const time = new Date().toLocaleTimeString().split(' ')[0];
    const entry = document.createElement('div');
    entry.style.color = color;
    entry.textContent = `[${time}] ${msg}`;
    eventLog.appendChild(entry);
    eventLog.scrollTop = eventLog.scrollHeight;
  }

  // Fetch persistent office layout from backend REST API
  async function loadActiveLayout() {
    try {
      const res = await fetch('/api/layout/active');
      if (res.ok) {
        const data = await res.json();
        if (data && data.layout) {
          activeLayout = data.layout;
          logEvent(`Loaded persistent floorplan: "${activeLayout.name}"`, '#38bdf8');
        }
      }
    } catch (e) {
      console.warn('Could not fetch persistent layout, using defaults:', e);
    }
  }

  // Fetch room occupancy stats from backend analytics REST API
  async function updateRoomOccupancy() {
    try {
      const res = await fetch('/api/analytics/occupancy');
      if (res.ok) {
        const data = await res.json();
        renderOccupancyUI(data.occupancy || {});
      }
    } catch (e) {
      // Offline fallback
    }
  }

  function renderOccupancyUI(occupancy) {
    if (!occupancyList) return;
    occupancyList.innerHTML = '';

    for (const [zoneId, info] of Object.entries(occupancy)) {
      const li = document.createElement('li');
      li.className = 'occupancy-item';

      const zoneName = zoneId === 'conf-a' ? 'Conference Alpha'
        : zoneId === 'podium' ? 'Town Hall Podium'
        : zoneId === 'breakout-beta' ? 'Breakout Pod'
        : zoneId === 'quiet-lounge' ? 'Quiet Lounge'
        : 'Open Workspace';

      li.innerHTML = `
        <span>${zoneName}</span>
        <span style="font-weight: 700; color: ${info.isAtCapacity ? '#ef4444' : '#38bdf8'}">
          ${info.count} / ${info.capacity}
        </span>
      `;
      occupancyList.appendChild(li);
    }
  }

  // Fetch or trigger Audio DSP benchmark
  async function updateAudioBenchmark(triggerRun = false) {
    try {
      const url = triggerRun ? '/api/audio/benchmark/run' : '/api/audio/benchmark/latest';
      const method = triggerRun ? 'POST' : 'GET';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: triggerRun ? JSON.stringify({ numAvatars: 25, iterations: 15 }) : undefined,
      });

      if (res.ok) {
        const data = await res.json();
        if (benchOpsLabel && data.metrics) {
          benchOpsLabel.textContent = `${data.metrics.opsPerSec.toLocaleString()} ops/s`;
        }
        if (benchStatusLabel) {
          benchStatusLabel.textContent = data.overallRating || data.overallStatus;
          benchStatusLabel.style.color = data.overallStatus === 'HEALTHY' ? '#4ade80' : '#f59e0b';
        }
        if (triggerRun && data.metrics) {
          logEvent(`Audio Benchmark: ${data.metrics.opsPerSec.toLocaleString()} ops/s (${data.metrics.durationMs}ms)`, '#4ade80');
        }
      }
    } catch (e) {
      // Quiet fallback
    }
  }

  if (benchBtn) {
    benchBtn.addEventListener('click', () => {
      benchBtn.disabled = true;
      benchBtn.textContent = '⏳ Testing...';
      updateAudioBenchmark(true).finally(() => {
        benchBtn.disabled = false;
        benchBtn.textContent = '⚡ Run Audit';
      });
    });
  }

  // Viewport Auto-fit Transform for perfect scaling on any laptop resolution
  let viewTransform = { scale: 1, offsetX: 0, offsetY: 0 };

  function updateViewTransform() {
    const targetW = 1140;
    const targetH = 720;
    const scaleX = canvas.width / targetW;
    const scaleY = canvas.height / targetH;
    const scale = Math.min(scaleX, scaleY, 1.1);
    const offsetX = Math.max(0, (canvas.width - targetW * scale) / 2);
    const offsetY = Math.max(0, (canvas.height - targetH * scale) / 2);
    viewTransform = { scale, offsetX, offsetY };
  }

  // Keyboard navigation state
  const keys = {};
  window.addEventListener('keydown', (e) => {
    keys[e.key.toLowerCase()] = true;
  });
  window.addEventListener('keyup', (e) => {
    keys[e.key.toLowerCase()] = false;
  });

  // Mouse click-to-move with viewport coordinate transformation
  canvas.addEventListener('click', (e) => {
    const rect = canvas.getBoundingClientRect();
    const rawX = e.clientX - rect.left;
    const rawY = e.clientY - rect.top;
    myAvatar.targetX = (rawX - viewTransform.offsetX) / viewTransform.scale;
    myAvatar.targetY = (rawY - viewTransform.offsetY) / viewTransform.scale;
  });

  // Mute button toggle
  if (muteBtn) {
    muteBtn.addEventListener('click', () => {
      myAvatar.isMuted = !myAvatar.isMuted;
      muteBtn.classList.toggle('active', myAvatar.isMuted);
      muteBtn.textContent = myAvatar.isMuted ? '🔇 Mic Muted' : '🎙️ Mic Active';
      socket.emit('audio:state', {
        isMuted: myAvatar.isMuted,
        isSpeaking: !myAvatar.isMuted,
      });
      logEvent(`Microphone ${myAvatar.isMuted ? 'Muted' : 'Unmuted'}`, myAvatar.isMuted ? '#ef4444' : '#22c55e');
    });
  }

  // Socket Lifecycle Handlers
  socket.on('connect', () => {
    logEvent(`Connected to signaling server (ID: ${socket.id})`, '#4ade80');

    // Announce presence
    socket.emit('user:join', {
      userId: myAvatar.userId,
      displayName: myAvatar.displayName,
      canvasX: myAvatar.x,
      canvasY: myAvatar.y,
    });
  });

  socket.on('room:state', (state) => {
    if (state.earshotRadius) earshotRadius = state.earshotRadius;
    if (state.occupancy) renderOccupancyUI(state.occupancy);

    // Populate existing remote peers
    if (Array.isArray(state.peers)) {
      remotePeers.clear();
      state.peers.forEach((peer) => {
        if (peer.userId !== myAvatar.userId) {
          remotePeers.set(peer.userId, {
            ...peer,
            targetX: peer.canvasX,
            targetY: peer.canvasY,
            x: peer.canvasX,
            y: peer.canvasY,
          });
        }
      });
      updatePeersCountUI();
    }
  });

  socket.on('user:joined', (user) => {
    if (user.userId === myAvatar.userId) return;
    remotePeers.set(user.userId, {
      ...user,
      targetX: user.canvasX,
      targetY: user.canvasY,
      x: user.canvasX,
      y: user.canvasY,
    });
    logEvent(`Peer joined: ${user.displayName}`, '#38bdf8');
    updatePeersCountUI();
  });

  socket.on('player:moved', (payload) => {
    const peer = remotePeers.get(payload.userId);
    if (peer) {
      peer.targetX = payload.canvasX;
      peer.targetY = payload.canvasY;
      peer.zone = payload.zone;
      peer.isOnStage = payload.isOnStage;
    }
  });

  socket.on('user:left', ({ userId, reason }) => {
    const peer = remotePeers.get(userId);
    if (peer) {
      logEvent(`Peer departed: ${peer.displayName} (${reason || 'disconnected'})`, '#94a3b8');
      remotePeers.delete(userId);
      audiblePeers.delete(userId);
      updatePeersCountUI();
      renderAudiblePeersUI();
    }
  });

  socket.on('zone:occupancy_update', (occupancy) => {
    renderOccupancyUI(occupancy);
  });

  socket.on('spotlight:speaker_entered', ({ displayName }) => {
    if (spotlightBanner) {
      spotlightBanner.textContent = `🎤 ${displayName} is speaking on the Town Hall Podium!`;
      spotlightBanner.style.display = 'block';
      setTimeout(() => {
        spotlightBanner.style.display = 'none';
      }, 5000);
    }
  });

  // Proximity Audio Events
  socket.on('proximity:enter', (t) => {
    audiblePeers.set(t.peerId, t);
    renderAudiblePeersUI();
  });

  socket.on('proximity:update', (t) => {
    audiblePeers.set(t.peerId, t);
    renderAudiblePeersUI();
  });

  socket.on('proximity:leave', ({ peerId }) => {
    audiblePeers.delete(peerId);
    renderAudiblePeersUI();
  });

  // QoS Latency Ping
  setInterval(() => {
    const now = Date.now();
    socket.emit('telemetry:ping', { timestamp: now });
  }, 3000);

  socket.on('telemetry:pong', (data) => {
    if (pingLabel && typeof data.rttMs === 'number') {
      pingLabel.textContent = `${data.rttMs}ms`;
    }
  });

  function updatePeersCountUI() {
    if (peersCountLabel) {
      peersCountLabel.textContent = String(remotePeers.size);
    }
  }

  function renderAudiblePeersUI() {
    if (!audibleList) return;
    audibleList.innerHTML = '';

    if (audiblePeers.size === 0) {
      audibleList.innerHTML = '<li class="peer-item" style="color: #64748b;">No peers in audio range</li>';
      return;
    }

    audiblePeers.forEach((p, peerId) => {
      const peer = remotePeers.get(peerId);
      const name = peer ? peer.displayName : peerId;
      const li = document.createElement('li');
      li.className = 'peer-item';

      const tagClass = p.mode === 'occluded' ? 'occluded-tag' : 'audible-tag';
      const volPct = Math.round((p.effectiveVolume !== undefined ? p.effectiveVolume : 1) * 100);

      li.innerHTML = `
        <div style="display:flex; flex-direction:column; gap:2px;">
          <span><b>${name}</b></span>
          <span style="font-size:0.7rem; color:#94a3b8;">${p.distance}px • ${p.mode}</span>
        </div>
        <div style="display:flex; align-items:center; gap:6px;">
          <span class="pan-indicator">${p.pan !== undefined ? (p.pan < 0 ? `L${Math.round(-p.pan*100)}` : p.pan > 0 ? `R${Math.round(p.pan*100)}` : 'C') : 'C'}</span>
          <span class="${tagClass}">${volPct}% vol</span>
        </div>
      `;
      audibleList.appendChild(li);
    });
  }

  // Active Zone Detection Helper
  function evaluateCurrentZone() {
    let currentZone = { id: 'open-office', name: 'Open Workspace', isOnStage: false };

    for (const zone of activeLayout.zones) {
      const b = zone.bounds;
      if (myAvatar.x >= b.x && myAvatar.x <= b.x + b.width && myAvatar.y >= b.y && myAvatar.y <= b.y + b.height) {
        currentZone = {
          id: zone.zoneId,
          name: zone.name,
          isOnStage: Boolean(zone.isSpotlightBroadcast),
        };
        break;
      }
    }

    if (myAvatar.zone !== currentZone.id) {
      myAvatar.zone = currentZone.id;
      myAvatar.zoneName = currentZone.name;
      myAvatar.isOnStage = currentZone.isOnStage;

      if (zoneLabel) zoneLabel.textContent = currentZone.name;
      if (spotlightBanner) {
        spotlightBanner.style.display = currentZone.isOnStage ? 'block' : 'none';
      }

      socket.emit('zone:change', {
        zoneId: currentZone.id,
        zoneName: currentZone.name,
        isOnStage: currentZone.isOnStage,
      });

      logEvent(`Entered: ${currentZone.name}`, currentZone.isOnStage ? '#eab308' : '#38bdf8');
    }
  }

  // Helper for drawing rounded rectangles
  function drawRoundedRect(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.arcTo(x + width, y, x + width, y + radius, radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.arcTo(x + width, y + height, x + width - radius, y + height, radius);
    ctx.lineTo(x + radius, y + height);
    ctx.arcTo(x, y + height, x, y + height - radius, radius);
    ctx.lineTo(x, y + radius);
    ctx.arcTo(x, y, x + radius, y, radius);
    ctx.closePath();
  }

  // Animation & Rendering Loop
  let lastMoveEmit = 0;

  function update() {
    let dx = 0;
    let dy = 0;

    if (keys['w'] || keys['arrowup']) dy -= myAvatar.speed;
    if (keys['s'] || keys['arrowdown']) dy += myAvatar.speed;
    if (keys['a'] || keys['arrowleft']) dx -= myAvatar.speed;
    if (keys['d'] || keys['arrowright']) dx += myAvatar.speed;

    if (dx !== 0 || dy !== 0) {
      myAvatar.targetX = Math.max(30, Math.min(1100, myAvatar.x + dx));
      myAvatar.targetY = Math.max(30, Math.min(680, myAvatar.y + dy));
    }

    // Smooth Lerp Interpolation
    myAvatar.x += (myAvatar.targetX - myAvatar.x) * 0.22;
    myAvatar.y += (myAvatar.targetY - myAvatar.y) * 0.22;

    remotePeers.forEach((peer) => {
      peer.x += (peer.targetX - peer.x) * 0.18;
      peer.y += (peer.targetY - peer.y) * 0.18;
    });

    evaluateCurrentZone();

    // Throttled 30Hz Movement Broadcast
    const now = Date.now();
    if (now - lastMoveEmit >= 33) {
      lastMoveEmit = now;
      socket.emit('player:move', {
        x: Math.round(myAvatar.x),
        y: Math.round(myAvatar.y),
      });

      if (coordsLabel) {
        coordsLabel.textContent = `(${Math.round(myAvatar.x)}, ${Math.round(myAvatar.y)})`;
      }
    }
  }

  function draw() {
    updateViewTransform();
    // 0. Reset transform and clear physical canvas
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 0. Apply safe non-compounding viewport scaling & centering
    ctx.setTransform(
      viewTransform.scale,
      0,
      0,
      viewTransform.scale,
      viewTransform.offsetX,
      viewTransform.offsetY
    );

    // Office Outer Boundary Wall
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 2;
    drawRoundedRect(ctx, 20, 20, 1100, 680, 16);
    ctx.stroke();

    // 1. Draw High-Tech Blueprint Grid
    ctx.strokeStyle = 'rgba(30, 41, 59, 0.45)';
    ctx.lineWidth = 1;
    const gridSize = 40;

    for (let x = 20; x <= 1120; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 20);
      ctx.lineTo(x, 700);
      ctx.stroke();
    }
    for (let y = 20; y <= 700; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(20, y);
      ctx.lineTo(1120, y);
      ctx.stroke();
    }

    // Subtle grid intersection points
    ctx.fillStyle = 'rgba(56, 189, 248, 0.2)';
    for (let x = 20; x <= 1120; x += gridSize * 2) {
      for (let y = 20; y <= 700; y += gridSize * 2) {
        ctx.fillRect(x - 1, y - 1, 2, 2);
      }
    }

    // 2. Draw Acoustic Zones (Conference Room, Podium, Breakout, Lounge)
    activeLayout.zones.forEach((zone) => {
      const { x, y, width, height } = zone.bounds;

      ctx.save();
      // Glassmorphic room background
      drawRoundedRect(ctx, x, y, width, height, 12);
      ctx.fillStyle = zone.theme?.fill || 'rgba(15, 23, 42, 0.7)';
      ctx.fill();

      // Glowing room border
      ctx.strokeStyle = zone.theme?.border || '#38bdf8';
      ctx.lineWidth = 2.5;
      ctx.stroke();

      // Distinct Header Badge Pill for Zone Name
      const pillWidth = Math.min(width - 24, 210);
      drawRoundedRect(ctx, x + 12, y + 10, pillWidth, 24, 6);
      ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
      ctx.fill();
      ctx.strokeStyle = zone.theme?.border || '#38bdf8';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Zone Title Text
      ctx.fillStyle = zone.theme?.labelColor || '#f8fafc';
      ctx.font = 'bold 11px sans-serif';
      const icon = zone.isSpotlightBroadcast ? '🎙️ ' : zone.isSoundproof ? '🔒 ' : '👥 ';
      ctx.fillText(icon + zone.name, x + 20, y + 26);

      // Soundproof/Broadcast subtitle pill
      if (zone.isSoundproof) {
        ctx.font = '9px monospace';
        ctx.fillStyle = '#38bdf8';
        ctx.fillText('SOUNDPROOF • FULL ISOLATION', x + 16, y + 50);
      } else if (zone.isSpotlightBroadcast) {
        ctx.font = '9px monospace';
        ctx.fillStyle = '#f59e0b';
        ctx.fillText('GLOBAL STAGE BROADCAST', x + 16, y + 50);
      }
      ctx.restore();
    });

    // 3. Draw Acoustic Walls & Partitions with Material Labels
    activeLayout.obstacles.forEach((obs) => {
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(obs.x1, obs.y1);
      ctx.lineTo(obs.x2, obs.y2);

      let color = '#f59e0b';
      let width = 5;
      let label = 'Drywall (-12dB)';

      if (obs.material === 'glass') {
        color = '#38bdf8';
        width = 4;
        label = 'Glass (-6dB)';
      } else if (obs.material === 'acoustic_foam') {
        color = '#22c55e';
        width = 6;
        label = 'Acoustic Foam (-18dB)';
      } else if (obs.material === 'concrete') {
        color = '#94a3b8';
        width = 8;
        label = 'Concrete Pillar (-30dB)';
      }

      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.stroke();

      // Wall mid-point badge
      const midX = (obs.x1 + obs.x2) / 2;
      const midY = (obs.y1 + obs.y2) / 2;
      ctx.fillStyle = color;
      ctx.font = '8px monospace';
      ctx.fillText(label, midX + 6, midY);
      ctx.restore();
    });

    // 4. Draw Furniture Assets (Clean Modern Workstations - NO OVERLAPPING TEXT)
    activeLayout.furniture.forEach((f) => {
      ctx.save();
      if (f.type === 'desk') {
        // Modern rounded desk
        drawRoundedRect(ctx, f.x, f.y, f.width, f.height, 4);
        ctx.fillStyle = '#1e293b';
        ctx.fill();
        ctx.strokeStyle = '#334155';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Dual monitors on desk
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(f.x + 8, f.y + 6, 18, 5);
        ctx.fillRect(f.x + 32, f.y + 6, 18, 5);
        ctx.fillStyle = '#38bdf8';
        ctx.fillRect(f.x + 9, f.y + 7, 16, 3);
        ctx.fillRect(f.x + 33, f.y + 7, 16, 3);

        // Compact clean owner tag
        let ownerTag = 'Dev Desk';
        let tagColor = '#94a3b8';
        if (f.id.includes('mujtaba')) {
          ownerTag = '👑 Mujtaba';
          tagColor = '#38bdf8';
        } else if (f.id.includes('kuldeep')) {
          ownerTag = '💾 Kuldeep';
          tagColor = '#34d399';
        } else if (f.id.includes('santosh')) {
          ownerTag = '🎧 Santosh';
          tagColor = '#fbbf24';
        } else if (f.id.includes('akhila')) {
          ownerTag = '🎨 Akhila';
          tagColor = '#c084fc';
        }

        ctx.fillStyle = tagColor;
        ctx.font = 'bold 9px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(ownerTag, f.x + f.width / 2, f.y + f.height + 12);

      } else if (f.type === 'table') {
        // Boardroom oval table
        drawRoundedRect(ctx, f.x, f.y, f.width, f.height, 16);
        ctx.fillStyle = '#1e293b';
        ctx.fill();
        ctx.strokeStyle = '#0284c7';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.fillStyle = '#38bdf8';
        ctx.font = 'bold 10px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Boardroom Table', f.x + f.width / 2, f.y + f.height / 2 + 3);

      } else if (f.type === 'podium') {
        // Keynote Stand
        drawRoundedRect(ctx, f.x, f.y, f.width, f.height, 6);
        ctx.fillStyle = '#ca8a04';
        ctx.fill();
        ctx.strokeStyle = '#fde047';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.fillStyle = '#0f172a';
        ctx.font = 'bold 14px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('🎙️', f.x + f.width / 2, f.y + f.height / 2 + 5);

      } else if (f.type === 'plant') {
        // Decorative Plant
        ctx.beginPath();
        ctx.arc(f.x + f.width / 2, f.y + f.height / 2, f.width / 2, 0, Math.PI * 2);
        ctx.fillStyle = '#166534';
        ctx.fill();
        ctx.strokeStyle = '#22c55e';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.fillStyle = '#ffffff';
        ctx.font = '12px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('🌿', f.x + f.width / 2, f.y + f.height / 2 + 4);

      } else {
        // Generic Furniture / Sofa
        drawRoundedRect(ctx, f.x, f.y, f.width, f.height, 8);
        ctx.fillStyle = '#1e293b';
        ctx.fill();
        ctx.strokeStyle = '#475569';
        ctx.stroke();

        ctx.fillStyle = '#94a3b8';
        ctx.font = '9px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(f.name, f.x + f.width / 2, f.y + f.height / 2 + 3);
      }
      ctx.restore();
    });

    // 5. Draw Acoustic Raycast Lines to audible peers
    audiblePeers.forEach((p, peerId) => {
      const peer = remotePeers.get(peerId);
      if (peer) {
        ctx.beginPath();
        ctx.moveTo(myAvatar.x, myAvatar.y);
        ctx.lineTo(peer.x, peer.y);

        if (p.mode === 'occluded') {
          ctx.strokeStyle = '#f59e0b';
          ctx.setLineDash([4, 4]);
        } else {
          ctx.strokeStyle = 'rgba(74, 222, 128, 0.4)';
          ctx.setLineDash([]);
        }
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.setLineDash([]);
      }
    });

    // 6. Draw Local Player Earshot Radius (100px Proximity Halo)
    ctx.save();
    ctx.beginPath();
    ctx.arc(myAvatar.x, myAvatar.y, earshotRadius, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(56, 189, 248, 0.05)';
    ctx.fill();
    ctx.strokeStyle = myAvatar.isOnStage ? 'rgba(234, 179, 8, 0.6)' : 'rgba(56, 189, 248, 0.4)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 6]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    // 7. Draw Remote Peers
    remotePeers.forEach((peer) => {
      ctx.save();
      // Peer Avatar Body
      ctx.beginPath();
      ctx.arc(peer.x, peer.y, 14, 0, Math.PI * 2);
      ctx.fillStyle = peer.isOnStage ? '#eab308' : '#a855f7';
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Peer Nameplate Badge
      drawRoundedRect(ctx, peer.x - 36, peer.y + 18, 72, 18, 4);
      ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
      ctx.fill();
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.fillStyle = '#f8fafc';
      ctx.font = 'bold 9px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(peer.displayName, peer.x, peer.y + 30);
      ctx.restore();
    });

    // 8. Draw Local Player Avatar (You) with Glowing Halo
    ctx.save();
    // Soft outer glow halo
    ctx.beginPath();
    ctx.arc(myAvatar.x, myAvatar.y, myAvatar.radius + 6, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(56, 189, 248, 0.2)';
    ctx.fill();

    // Avatar Circle
    ctx.beginPath();
    ctx.arc(myAvatar.x, myAvatar.y, myAvatar.radius, 0, Math.PI * 2);
    ctx.fillStyle = myAvatar.isOnStage ? '#eab308' : myAvatar.color;
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Local Player Nameplate Badge
    const labelText = myAvatar.displayName + ' (You)';
    drawRoundedRect(ctx, myAvatar.x - 48, myAvatar.y + 20, 96, 20, 6);
    ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
    ctx.fill();
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(labelText, myAvatar.x, myAvatar.y + 34);
    ctx.restore();

    // Reset matrix transform to default identity
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  function loop() {
    update();
    draw();
    requestAnimationFrame(loop);
  }

  // Initialize
  loadActiveLayout().then(() => {
    updateRoomOccupancy();
    updateAudioBenchmark();
    requestAnimationFrame(loop);
  });
})();
