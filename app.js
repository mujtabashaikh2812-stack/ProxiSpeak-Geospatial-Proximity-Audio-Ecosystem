/**
 * ProxiSpeak 2D Virtual Office Canvas Client
 * Author: Nedunuri Akhila (Touched up & integrated for Mid-Project Review)
 * Features:
 * - Real-time Socket.io multiplayer with offline mock fallback
 * - Conference Room Alpha (soundproof glass room)
 * - Town Hall Stage & Podium (spotlight audio broadcast)
 * - 60 FPS HTML5 Canvas animation loop with WASD keyboard controls
 */

const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const statusText = document.getElementById('statusText');
const userList = document.getElementById('userList');
const zoneBadge = document.getElementById('zoneBadge');
const coordsDisplay = document.getElementById('coordsDisplay');
const peerCountBadge = document.getElementById('peerCountBadge');
const spotlightAlert = document.getElementById('spotlightAlert');

// Proximity & Spatial constants
const EARSHOT_RADIUS = 100; // px
const LERP_FACTOR = 0.2;

// Local Player State
const me = {
  id: 'me-' + Math.floor(1000 + Math.random() * 9000),
  name: 'You (Akhila)',
  x: 220,
  y: 260,
  radius: 14,
  color: '#38bdf8',
  speed: 4,
  zone: 'open',
  isOnStage: false,
  facingAngle: 0, // Direction angle in radians (East by default)
};

// Office Zones
const ZONES = {
  conferenceRoom: {
    name: 'Conference Room Alpha',
    x: 60,
    y: 60,
    w: 280,
    h: 220,
    fill: 'rgba(224, 242, 254, 0.35)',
    border: '#0284c7',
  },
  podium: {
    name: 'Town Hall Stage & Podium',
    x: 680,
    y: 80,
    w: 180,
    h: 120,
    fill: 'rgba(254, 240, 138, 0.45)',
    border: '#ca8a04',
  },
};

// Office Furniture Desks (preserving layout)
const DESKS = [
  { x: 100, y: 110, w: 100, h: 60, label: 'Desk 1' },
  { x: 220, y: 110, w: 100, h: 60, label: 'Desk 2' },
  { x: 440, y: 380, w: 120, h: 70, label: 'Team Pod A' },
  { x: 620, y: 380, w: 120, h: 70, label: 'Team Pod B' },
  { x: 800, y: 380, w: 120, h: 70, label: 'Team Pod C' },
];

// Remote Peers (Live or Mock fallback)
let peers = new Map();

// Check if Point is inside rectangle
function inRect(x, y, rect) {
  return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
}

// Distance helper
function distance(a, b) {
  return Math.round(Math.hypot(a.x - b.x, a.y - b.y));
}

// Determine Current Zone
function getCurrentZone(x, y) {
  if (inRect(x, y, ZONES.conferenceRoom)) return 'conference';
  if (inRect(x, y, ZONES.podium)) return 'podium';
  return 'open';
}

// --- Socket.io Integration with Graceful Offline Fallback ---
let isLiveSocket = false;
let socket = null;

if (typeof io !== 'undefined') {
  try {
    socket = io();
    socket.on('connect', () => {
      isLiveSocket = true;
      socket.emit('user:join', {
        userId: me.id,
        displayName: me.name,
        canvasX: me.x,
        canvasY: me.y,
        facingAngle: me.facingAngle,
      });
    });

    socket.on('room:state', (data) => {
      if (data.peers) {
        data.peers.forEach((p) => {
          peers.set(p.userId, {
            id: p.userId,
            name: p.displayName,
            x: p.canvasX,
            y: p.canvasY,
            targetX: p.canvasX,
            targetY: p.canvasY,
            color: '#a855f7',
            isOnStage: p.isOnStage,
            facingAngle: p.facingAngle !== undefined ? p.facingAngle : 0,
          });
        });
      }
    });

    socket.on('player:moved', (data) => {
      let p = peers.get(data.userId);
      if (!p) {
        p = {
          id: data.userId,
          name: data.displayName || data.userId,
          x: data.canvasX,
          y: data.canvasY,
          targetX: data.canvasX,
          targetY: data.canvasY,
          color: '#a855f7',
          facingAngle: data.facingAngle !== undefined ? data.facingAngle : 0,
        };
        peers.set(data.userId, p);
      } else {
        p.targetX = data.canvasX;
        p.targetY = data.canvasY;
        if (data.facingAngle !== undefined) {
          p.facingAngle = data.facingAngle;
        }
      }
      p.isOnStage = data.isOnStage;
    });

    socket.on('user:left', (data) => {
      peers.delete(data.userId);
    });
  } catch (_) {
    isLiveSocket = false;
  }
}

// Fallback: Populate mock peers if offline
if (!isLiveSocket) {
  peers.set('p-1', {
    id: 'p-1',
    name: 'Aisha (Dev)',
    x: 500,
    y: 390,
    targetX: 500,
    targetY: 390,
    color: '#2ecf7d',
    facingAngle: -Math.PI / 2, // Facing North (at desk)
  });
  peers.set('p-2', {
    id: 'p-2',
    name: 'Nikhil (Lead)',
    x: 740,
    y: 130,
    targetX: 740,
    targetY: 130,
    color: '#eab308',
    isOnStage: true,
    facingAngle: Math.PI / 2, // Facing South (addressing crowd)
  });
  peers.set('p-3', {
    id: 'p-3',
    name: 'Priya (UI)',
    x: 670,
    y: 400,
    targetX: 670,
    targetY: 400,
    color: '#ec4899',
    facingAngle: -Math.PI / 2, // Facing North (at desk)
  });
}

// Keyboard Input Handler
const keys = {};
document.addEventListener('keydown', (e) => {
  keys[e.key.toLowerCase()] = true;
  keys[e.key] = true;
});
document.addEventListener('keyup', (e) => {
  keys[e.key.toLowerCase()] = false;
  keys[e.key] = false;
});

function movePlayer() {
  let dx = 0;
  let dy = 0;
  if (keys['w'] || keys['arrowup']) dy -= me.speed;
  if (keys['s'] || keys['arrowdown']) dy += me.speed;
  if (keys['a'] || keys['arrowleft']) dx -= me.speed;
  if (keys['d'] || keys['arrowright']) dx += me.speed;

  if (dx !== 0 || dy !== 0) {
    // Track movement direction angle
    me.facingAngle = Math.atan2(dy, dx);
    me.x = Math.max(30, Math.min(canvas.width - 30, me.x + dx));
    me.y = Math.max(30, Math.min(canvas.height - 30, me.y + dy));

    if (socket && isLiveSocket) {
      socket.emit('player:move', { x: me.x, y: me.y, facingAngle: me.facingAngle });
    }
  }

  // Update current zone
  me.zone = getCurrentZone(me.x, me.y);
  me.isOnStage = me.zone === 'podium';
}

function updateHUD() {
  coordsDisplay.textContent = `(${Math.round(me.x)}, ${Math.round(me.y)})`;
  peerCountBadge.textContent = `${peers.size} Online`;

  // Update Zone Badge
  if (me.zone === 'conference') {
    zoneBadge.textContent = 'Conference Room Alpha';
    zoneBadge.className = 'zone-badge badge-room';
    statusText.textContent = '🔒 Room Audio (Soundproof)';
  } else if (me.zone === 'podium') {
    zoneBadge.textContent = 'Town Hall Podium';
    zoneBadge.className = 'zone-badge badge-podium';
    statusText.textContent = '📢 Broadcasting to All!';
  } else {
    zoneBadge.textContent = 'Open Workspace';
    zoneBadge.className = 'zone-badge badge-open';
    statusText.textContent = '👂 Proximity Audio (≤ 100px)';
  }

  spotlightAlert.style.display = me.isOnStage ? 'block' : 'none';

  // Render User List Sidebar
  let listHtml = '';
  peers.forEach((peer) => {
    const d = distance(me, peer);
    let canHear = false;
    let tag = '';

    if (peer.isOnStage || me.isOnStage) {
      canHear = true;
      tag = '<span class="tag-audible">📢 Stage (100%)</span>';
    } else if (me.zone === 'conference' && getCurrentZone(peer.x, peer.y) === 'conference') {
      canHear = true;
      tag = '<span class="tag-audible">🔒 Room (95%)</span>';
    } else if (me.zone === 'open' && getCurrentZone(peer.x, peer.y) === 'open' && d <= EARSHOT_RADIUS) {
      const vol = Math.round((1 - d / EARSHOT_RADIUS) * 100);
      canHear = true;
      tag = `<span class="tag-audible">👂 ${d}px (${vol}%)</span>`;
    } else {
      canHear = false;
      tag = `<span class="tag-inaudible">🔇 Silent (${d}px)</span>`;
    }

    listHtml += `<li><span>${peer.name}</span> ${tag}</li>`;
  });

  userList.innerHTML = listHtml || '<li class="empty-state">No coworkers nearby</li>';
}

// Canvas Drawing Routines

/**
 * Renders directional gaze (two white pupil dots) and facing indicator (subtle pointer triangle)
 * indicating whether the character is facing North, South, East, West, or diagonally.
 */
function drawFacingIndicator(x, y, radius, facingAngle) {
  if (facingAngle === undefined || facingAngle === null) return;

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(facingAngle);

  // 1. Subtle directional triangle pointer on the forward edge
  ctx.beginPath();
  ctx.moveTo(radius + 4, 0);       // Tip pointing forward
  ctx.lineTo(radius - 2, -3.5);    // Base top point
  ctx.lineTo(radius - 2, 3.5);     // Base bottom point
  ctx.closePath();
  ctx.fillStyle = '#ffffff';
  ctx.fill();

  // 2. Two small white pupil dots indicating directional gaze
  const eyeOffsetForward = radius * 0.45;
  const eyeOffsetSpread = radius * 0.35;
  const pupilRadius = 2.2;

  ctx.fillStyle = '#ffffff';

  // Left pupil dot
  ctx.beginPath();
  ctx.arc(eyeOffsetForward, -eyeOffsetSpread, pupilRadius, 0, Math.PI * 2);
  ctx.fill();

  // Right pupil dot
  ctx.beginPath();
  ctx.arc(eyeOffsetForward, eyeOffsetSpread, pupilRadius, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawScene() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // 1. Office Grid Background
  ctx.strokeStyle = '#1e293b';
  ctx.lineWidth = 1;
  const step = 40;
  for (let x = 0; x < canvas.width; x += step) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height);
    ctx.stroke();
  }
  for (let y = 0; y < canvas.height; y += step) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }

  // 2. Draw Conference Room Alpha
  const cr = ZONES.conferenceRoom;
  ctx.fillStyle = cr.fill;
  ctx.fillRect(cr.x, cr.y, cr.w, cr.h);
  ctx.strokeStyle = cr.border;
  ctx.lineWidth = 4;
  ctx.strokeRect(cr.x, cr.y, cr.w, cr.h);
  ctx.fillStyle = '#38bdf8';
  ctx.font = 'bold 13px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('🔒 Conference Room Alpha (Soundproof)', cr.x + 12, cr.y + 26);

  // 3. Draw Town Hall Stage & Podium
  const pd = ZONES.podium;
  ctx.fillStyle = pd.fill;
  ctx.fillRect(pd.x, pd.y, pd.w, pd.h);
  ctx.strokeStyle = pd.border;
  ctx.lineWidth = 3;
  ctx.strokeRect(pd.x, pd.y, pd.w, pd.h);
  ctx.fillStyle = '#fde047';
  ctx.font = 'bold 13px sans-serif';
  ctx.fillText('🎙️ Town Hall Stage (Broadcast)', pd.x + 10, pd.y + 26);

  // 4. Draw Desks & Computers
  DESKS.forEach((d) => {
    // Desk Surface
    ctx.fillStyle = '#334155';
    ctx.fillRect(d.x, d.y, d.w, d.h);
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 2;
    ctx.strokeRect(d.x, d.y, d.w, d.h);

    // Computer Monitor
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(d.x + d.w / 2 - 18, d.y + 8, 36, 6);

    // Label
    ctx.fillStyle = '#94a3b8';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(d.label, d.x + d.w / 2, d.y + d.h / 2 + 10);
  });

  // 5. Draw 100px Proximity Earshot Ring around Local Avatar
  ctx.beginPath();
  ctx.arc(me.x, me.y, EARSHOT_RADIUS, 0, Math.PI * 2);
  ctx.strokeStyle = me.isOnStage ? '#eab308' : 'rgba(56, 189, 248, 0.4)';
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 6]);
  ctx.stroke();
  ctx.setLineDash([]);

  // 6. Draw Remote Peers
  peers.forEach((peer) => {
    ctx.beginPath();
    ctx.arc(peer.x, peer.y, 14, 0, Math.PI * 2);
    ctx.fillStyle = peer.isOnStage ? '#eab308' : peer.color;
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Draw directional gaze & facing indicators
    drawFacingIndicator(peer.x, peer.y, 14, peer.facingAngle);

    ctx.fillStyle = '#f8fafc';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(peer.name, peer.x, peer.y - 20);

    if (peer.isOnStage) {
      ctx.fillStyle = '#fde047';
      ctx.fillText('🎙️ Speaker', peer.x, peer.y + 26);
    }
  });

  // 7. Draw Local Avatar
  ctx.beginPath();
  ctx.arc(me.x, me.y, me.radius, 0, Math.PI * 2);
  ctx.fillStyle = me.isOnStage ? '#eab308' : me.color;
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // Draw directional gaze & facing indicators
  drawFacingIndicator(me.x, me.y, me.radius, me.facingAngle);

  ctx.fillStyle = '#38bdf8';
  ctx.font = 'bold 12px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(me.name, me.x, me.y - 20);
}

// 60 FPS Render Loop
function animate() {
  movePlayer();
  peers.forEach((peer) => {
    const prevX = peer.x;
    const prevY = peer.y;
    peer.x += (peer.targetX - peer.x) * LERP_FACTOR;
    peer.y += (peer.targetY - peer.y) * LERP_FACTOR;

    // Track peer movement direction for smooth facing indicator orientation
    const peerDx = peer.x - prevX;
    const peerDy = peer.y - prevY;
    if (Math.hypot(peerDx, peerDy) > 0.05) {
      peer.facingAngle = Math.atan2(peerDy, peerDx);
    }
  });
  updateHUD();
  drawScene();
  requestAnimationFrame(animate);
}

animate();
