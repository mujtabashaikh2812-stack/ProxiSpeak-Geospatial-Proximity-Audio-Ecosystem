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
const canvasWidth = canvas.width;
const canvasHeight = canvas.height;
let dpr = window.devicePixelRatio || 1;
canvas.width = canvasWidth * dpr;
canvas.height = canvasHeight * dpr;
canvas.style.width = `${canvasWidth}px`;
canvas.style.height = `${canvasHeight}px`;
ctx.scale(dpr, dpr);

function updateCanvasResolution() {
  const nextDpr = window.devicePixelRatio || 1;
  if (nextDpr === dpr) return;

  dpr = nextDpr;
  canvas.width = canvasWidth * dpr;
  canvas.height = canvasHeight * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

window.addEventListener('resize', updateCanvasResolution);
const statusText = document.getElementById('statusText');
const userList = document.getElementById('userList');
const zoneBadge = document.getElementById('zoneBadge');
const coordsDisplay = document.getElementById('coordsDisplay');
const peerCountBadge = document.getElementById('peerCountBadge');
const spotlightAlert = document.getElementById('spotlightAlert');

// Avatar Customization Drawer DOM Elements
const drawerToggleBtn = document.getElementById('drawerToggleBtn');
const customizationDrawer = document.getElementById('customizationDrawer');
const drawerCloseBtn = document.getElementById('drawerCloseBtn');
const drawerOverlay = document.getElementById('drawerOverlay');
const displayNameInput = document.getElementById('displayNameInput');
const avatarPreviewCircle = document.getElementById('avatarPreviewCircle');
const previewNameLabel = document.getElementById('previewNameLabel');
const activeColorName = document.getElementById('activeColorName');
const colorPalette = document.getElementById('colorPalette');

// Proximity & Spatial constants
const EARSHOT_RADIUS = 100; // px
const LERP_FACTOR = 0.2;
const VOICE_THRESHOLD = 0.15; // Threshold for audio volume / speech activity
const PRESENTATION_BOARD = { x: 680, y: 26, w: 180, h: 48 };
let isPresentationBoardHovered = false;
let presentationNoticeUntil = 0;

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
  isSpeaking: false,
  isMuted: false,
};

// Office Zones
const ZONES = {
  conferenceRoom: {
    name: 'Conference Room Alpha',
    x: 60,
    y: 60,
    w: 280,
    h: 220,
    fill: 'rgba(224, 242, 254, 0.45)',
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

// Open Workspace Furniture Desks (preserving layout)
const DESKS = [
  { x: 440, y: 380, w: 120, h: 70, label: 'Team Pod A' },
  { x: 620, y: 380, w: 120, h: 70, label: 'Team Pod B' },
  { x: 800, y: 380, w: 120, h: 70, label: 'Team Pod C' },
];

// Remote Peers (Live or Mock fallback)
let peers = new Map();
let autoNavigationTargetId = null;
const coworkerListItems = new Map();

// Check if Point is inside rectangle
function inRect(x, y, rect) {
  return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
}

function getCanvasCoordinates(event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((event.clientX - rect.left) / rect.width) * canvasWidth,
    y: ((event.clientY - rect.top) / rect.height) * canvasHeight,
  };
}

canvas.addEventListener('pointermove', (event) => {
  const point = getCanvasCoordinates(event);
  isPresentationBoardHovered = inRect(point.x, point.y, PRESENTATION_BOARD);
  canvas.style.cursor = isPresentationBoardHovered ? 'pointer' : 'default';
});

canvas.addEventListener('pointerleave', () => {
  isPresentationBoardHovered = false;
  canvas.style.cursor = 'default';
});

canvas.addEventListener('click', (event) => {
  const point = getCanvasCoordinates(event);
  if (inRect(point.x, point.y, PRESENTATION_BOARD)) {
    presentationNoticeUntil = performance.now() + 3000;
  }
});

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
        isSpeaking: me.isSpeaking,
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
            radius: 14,
            color: '#a855f7',
            isOnStage: p.isOnStage,
            facingAngle: p.facingAngle !== undefined ? p.facingAngle : 0,
            isSpeaking: !!p.isSpeaking,
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
          radius: 14,
          color: '#a855f7',
          facingAngle: data.facingAngle !== undefined ? data.facingAngle : 0,
          isSpeaking: !!data.isSpeaking,
        };
        peers.set(data.userId, p);
      } else {
        p.targetX = data.canvasX;
        p.targetY = data.canvasY;
        if (data.facingAngle !== undefined) {
          p.facingAngle = data.facingAngle;
        }
        if (data.isSpeaking !== undefined) {
          p.isSpeaking = !!data.isSpeaking;
        }
      }
      p.isOnStage = data.isOnStage;
    });

    socket.on('player:speaking', (data) => {
      const p = peers.get(data.userId);
      if (p) {
        p.isSpeaking = !!data.isSpeaking;
      }
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
    radius: 14,
    color: '#2ecf7d',
    facingAngle: -Math.PI / 2, // Facing North (at desk)
    isSpeaking: false,
  });
  peers.set('p-2', {
    id: 'p-2',
    name: 'Nikhil (Lead)',
    x: 740,
    y: 130,
    targetX: 740,
    targetY: 130,
    radius: 14,
    color: '#eab308',
    isOnStage: true,
    facingAngle: Math.PI / 2, // Facing South (addressing crowd)
    isSpeaking: true, // Lead speaker on stage
  });
  peers.set('p-3', {
    id: 'p-3',
    name: 'Priya (UI)',
    x: 670,
    y: 400,
    targetX: 670,
    targetY: 400,
    radius: 14,
    color: '#ec4899',
    facingAngle: -Math.PI / 2, // Facing North (at desk)
    isSpeaking: false,
  });
}

userList.addEventListener('click', (event) => {
  const button = event.target instanceof Element ? event.target.closest('.walk-to-button') : null;
  if (!button || !userList.contains(button)) return;

  const peerId = button.dataset.peerId;
  if (!peers.has(peerId)) return;
  autoNavigationTargetId = autoNavigationTargetId === peerId ? null : peerId;
});

// Keyboard controls: movement, push-to-talk via Space/V, mute via M, drawer via C.
const keys = {};
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && customizationDrawer && customizationDrawer.classList.contains('open')) {
    closeDrawer();
    return;
  }

  // Ignore movement & push-to-talk keys when typing in input fields
  if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) {
    return;
  }

  const shortcut = e.key.toLowerCase();
  if (!e.repeat && shortcut === 'c') {
    e.preventDefault();
    if (customizationDrawer && customizationDrawer.classList.contains('open')) {
      closeDrawer();
    } else {
      openDrawer();
    }
    return;
  }

  if (!e.repeat && shortcut === 'm') {
    e.preventDefault();
    me.isMuted = !me.isMuted;
    if (me.isMuted && me.isSpeaking) {
      me.isSpeaking = false;
      if (socket && isLiveSocket) {
        socket.emit('player:speaking', { userId: me.id, isSpeaking: false });
      }
    }
    return;
  }

  if (e.key.startsWith('Arrow')) {
    e.preventDefault();
  }

  keys[e.key.toLowerCase()] = true;
  keys[e.key] = true;

  // Push-to-talk voice activity activation
  if (!me.isMuted && (e.code === 'Space' || shortcut === 'v')) {
    e.preventDefault();
    if (!me.isSpeaking) {
      me.isSpeaking = true;
      if (socket && isLiveSocket) {
        socket.emit('player:speaking', { userId: me.id, isSpeaking: true });
      }
    }
  }
});

document.addEventListener('keyup', (e) => {
  keys[e.key.toLowerCase()] = false;
  keys[e.key] = false;

  if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) {
    return;
  }

  // Release push-to-talk voice activity
  if (e.code === 'Space' || e.key.toLowerCase() === 'v') {
    if (me.isSpeaking) {
      me.isSpeaking = false;
      if (socket && isLiveSocket) {
        socket.emit('player:speaking', { userId: me.id, isSpeaking: false });
      }
    }
  }
});

// Virtual D-pad forwards touch holds through the existing keyboard movement handler.
const virtualControls = document.querySelectorAll('.virtual-control');
const activeTouchesByControl = new Map();

function dispatchMovementKey(type, key) {
  const code = `Key${key.toUpperCase()}`;
  document.dispatchEvent(new KeyboardEvent(type, {
    key,
    code,
    bubbles: true,
    cancelable: true,
  }));
}

function releaseVirtualControl(button, key) {
  const activeTouches = activeTouchesByControl.get(button);
  if (!activeTouches || activeTouches.size === 0) return;

  activeTouches.clear();
  button.setAttribute('aria-pressed', 'false');
  dispatchMovementKey('keyup', key);
}

virtualControls.forEach((button) => {
  const key = button.dataset.key;
  const activeTouches = new Set();
  activeTouchesByControl.set(button, activeTouches);

  button.addEventListener('touchstart', (event) => {
    event.preventDefault();
    const wasInactive = activeTouches.size === 0;
    for (const touch of event.changedTouches) {
      activeTouches.add(touch.identifier);
    }

    if (wasInactive && activeTouches.size > 0) {
      button.setAttribute('aria-pressed', 'true');
      dispatchMovementKey('keydown', key);
    }
  }, { passive: false });

  const endTouch = (event) => {
    event.preventDefault();
    for (const touch of event.changedTouches) {
      activeTouches.delete(touch.identifier);
    }

    if (activeTouches.size === 0) {
      button.setAttribute('aria-pressed', 'false');
      dispatchMovementKey('keyup', key);
    }
  };

  button.addEventListener('touchend', endTouch, { passive: false });
  button.addEventListener('touchcancel', endTouch, { passive: false });
});

window.addEventListener('blur', () => {
  Object.keys(keys).forEach((key) => {
    keys[key] = false;
  });

  if (me.isSpeaking) {
    me.isSpeaking = false;
    if (socket && isLiveSocket) {
      socket.emit('player:speaking', { userId: me.id, isSpeaking: false });
    }
  }

  virtualControls.forEach((button) => {
    releaseVirtualControl(button, button.dataset.key);
  });
});

// --- Avatar Customization Drawer Controller ---
function openDrawer() {
  if (!customizationDrawer) return;
  customizationDrawer.classList.add('open');
  customizationDrawer.setAttribute('aria-hidden', 'false');
  if (drawerOverlay) drawerOverlay.classList.add('open');
  if (displayNameInput) {
    displayNameInput.value = me.name;
    displayNameInput.focus();
  }
}

function closeDrawer() {
  if (!customizationDrawer) return;
  customizationDrawer.classList.remove('open');
  customizationDrawer.setAttribute('aria-hidden', 'true');
  if (drawerOverlay) drawerOverlay.classList.remove('open');
  canvas.focus();
}

if (drawerToggleBtn) {
  drawerToggleBtn.addEventListener('click', () => {
    if (customizationDrawer && customizationDrawer.classList.contains('open')) {
      closeDrawer();
    } else {
      openDrawer();
    }
  });
}

if (drawerCloseBtn) {
  drawerCloseBtn.addEventListener('click', closeDrawer);
}

if (drawerOverlay) {
  drawerOverlay.addEventListener('click', closeDrawer);
}

// Display Name & Role Input Handler
if (displayNameInput) {
  displayNameInput.addEventListener('input', (e) => {
    const val = e.target.value.trim();
    me.name = val || 'You (Akhila)';
    if (previewNameLabel) {
      previewNameLabel.textContent = me.name;
    }
    if (socket && isLiveSocket) {
      socket.emit('player:update', { userId: me.id, displayName: me.name, color: me.color });
    }
  });
}

// Color Palette Swatches Handler (Sky Blue, Emerald Green, Purple, Amber, Rose Pink)
if (colorPalette) {
  colorPalette.querySelectorAll('.color-swatch').forEach((swatch) => {
    swatch.addEventListener('click', () => {
      colorPalette.querySelectorAll('.color-swatch').forEach((s) => {
        s.classList.remove('active');
        s.setAttribute('aria-pressed', 'false');
      });
      swatch.classList.add('active');
      swatch.setAttribute('aria-pressed', 'true');

      const chosenColor = swatch.getAttribute('data-color');
      const colorName = swatch.getAttribute('data-name') || 'Custom';

      me.color = chosenColor;
      if (avatarPreviewCircle) {
        avatarPreviewCircle.style.background = chosenColor;
      }
      if (activeColorName) {
        activeColorName.textContent = `Selected: ${colorName}`;
      }

      if (socket && isLiveSocket) {
        socket.emit('player:update', { userId: me.id, displayName: me.name, color: me.color });
      }
    });
  });
}

function movePlayer() {
  let dx = 0;
  let dy = 0;
  if (keys['w'] || keys['arrowup']) dy -= me.speed;
  if (keys['s'] || keys['arrowdown']) dy += me.speed;
  if (keys['a'] || keys['arrowleft']) dx -= me.speed;
  if (keys['d'] || keys['arrowright']) dx += me.speed;

  const movementMagnitude = Math.hypot(dx, dy);
  if (movementMagnitude > me.speed) {
    dx = (dx / movementMagnitude) * me.speed;
    dy = (dy / movementMagnitude) * me.speed;
  }

  if (dx !== 0 || dy !== 0) {
    autoNavigationTargetId = null;
  } else if (autoNavigationTargetId !== null) {
    const target = peers.get(autoNavigationTargetId);
    if (!target) {
      autoNavigationTargetId = null;
    } else {
      const targetDx = target.x - me.x;
      const targetDy = target.y - me.y;
      const remainingDistance = Math.hypot(targetDx, targetDy);

      if (remainingDistance <= me.speed) {
        me.x = target.x;
        me.y = target.y;
        autoNavigationTargetId = null;
      } else {
        dx = (targetDx / remainingDistance) * me.speed;
        dy = (targetDy / remainingDistance) * me.speed;
      }
    }
  }

  if (dx !== 0 || dy !== 0) {
    // Track movement direction angle
    me.facingAngle = Math.atan2(dy, dx);
    me.x = Math.max(30, Math.min(canvasWidth - 30, me.x + dx));
    me.y = Math.max(30, Math.min(canvasHeight - 30, me.y + dy));

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
    zoneBadge.className = 'zone-badge badge-room badge-private-meeting';
    statusText.textContent = '🔒 PRIVATE MEETING IN PROGRESS';
  } else if (me.zone === 'podium') {
    zoneBadge.textContent = 'Town Hall Podium';
    zoneBadge.className = 'zone-badge badge-podium';
    statusText.textContent = '📢 Broadcasting to All!';
  } else {
    zoneBadge.textContent = 'Open Workspace';
    zoneBadge.className = 'zone-badge badge-open';
    statusText.textContent = '👂 Proximity Audio (≤ 100px)';
  }

  if (me.isMuted) {
    statusText.textContent += ' • Push-to-talk Muted';
  } else if (me.isSpeaking) {
    statusText.textContent += ' • 🎙️ Mic Transmitting';
  }

  spotlightAlert.style.display = me.isOnStage ? 'block' : 'none';

  // Keep the roster keyed by peer so live distance updates do not replace focused controls.
  const onlinePeerIds = new Set();
  peers.forEach((peer) => {
    onlinePeerIds.add(peer.id);
    const d = distance(me, peer);
    let item = coworkerListItems.get(peer.id);
    if (!item) {
      item = document.createElement('li');
      item.className = 'coworker-item';

      const details = document.createElement('div');
      details.className = 'coworker-details';

      const name = document.createElement('span');
      name.className = 'coworker-name';

      const distanceLabel = document.createElement('span');
      distanceLabel.className = 'coworker-distance';

      const rangeLabel = document.createElement('span');
      rangeLabel.className = 'coworker-range';

      const walkButton = document.createElement('button');
      walkButton.className = 'walk-to-button';
      walkButton.type = 'button';

      details.append(name, distanceLabel, rangeLabel);
      item.append(details, walkButton);
      coworkerListItems.set(peer.id, { item, name, distanceLabel, rangeLabel, walkButton });
    }

    const elements = coworkerListItems.get(peer.id);
    elements.name.textContent = peer.name;
    elements.distanceLabel.textContent = `${d}px`;
    const inEarshot = d <= EARSHOT_RADIUS;
    elements.rangeLabel.textContent = inEarshot ? 'In Earshot 🟢' : 'Out of Range ⚪';
    elements.rangeLabel.className = `coworker-range ${inEarshot ? 'in-earshot' : 'out-of-range'}`;
    if (peer.isSpeaking) elements.rangeLabel.textContent += ' · 🎙️ Speaking';
    elements.walkButton.dataset.peerId = peer.id;
    const isTarget = autoNavigationTargetId === peer.id;
    elements.walkButton.textContent = isTarget ? 'Stop' : 'Walk to';
    elements.walkButton.setAttribute('aria-pressed', String(isTarget));
    elements.walkButton.setAttribute(
      'aria-label',
      isTarget ? `Stop walking to ${peer.name}` : `Walk to ${peer.name}`,
    );
    if (elements.item.parentElement !== userList) userList.append(elements.item);
  });

  coworkerListItems.forEach((elements, peerId) => {
    if (!onlinePeerIds.has(peerId)) {
      elements.item.remove();
      coworkerListItems.delete(peerId);
      if (autoNavigationTargetId === peerId) autoNavigationTargetId = null;
    }
  });

  if (coworkerListItems.size === 0) {
    if (!userList.querySelector('.empty-state')) {
      const emptyState = document.createElement('li');
      emptyState.className = 'empty-state';
      emptyState.textContent = 'No coworkers nearby';
      userList.append(emptyState);
    }
  } else {
    userList.querySelector('.empty-state')?.remove();
  }
}

// Canvas Drawing Routines

/**
 * Voice Activity Ripple Animation
 * If a peer or the local user is speaking (isSpeaking === true or volume > threshold):
 * Draw 2 concentric pulsing green rings expanding outward from the avatar radius:
 * ctx.strokeStyle = `rgba(34, 197, 94, ${1 - rippleProgress})`;
 * ctx.lineWidth = 2;
 * ctx.beginPath();
 * ctx.arc(p.x, p.y, p.radius + rippleProgress * 15, 0, Math.PI * 2);
 * ctx.stroke();
 * Visually communicates who is speaking without glancing at a text HUD.
 */
function drawVoiceActivityRipples(p, timestamp) {
  if (!p) return;
  const isSpeaking = p.isSpeaking === true || (p.volume !== undefined && p.volume > VOICE_THRESHOLD);
  if (!isSpeaking) return;

  const radius = p.radius || 14;
  const cycleDuration = 1000; // 1 second pulse cycle
  const numRings = 2;

  for (let i = 0; i < numRings; i++) {
    // 2 concentric pulsing rings offset by half-cycle (0.5)
    const phaseOffset = i / numRings;
    const rippleProgress = ((timestamp / cycleDuration) + phaseOffset) % 1;

    ctx.save();
    ctx.strokeStyle = `rgba(34, 197, 94, ${1 - rippleProgress})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(p.x, p.y, radius + rippleProgress * 15, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

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

/**
 * Radar Minimap Overview HUD
 * Renders a 140x90px translucent radar box in the bottom-left corner
 * with scaled office bounds (scale factor ~0.12), miniature room rectangles,
 * and colored player dots.
 */
function drawRadarMinimap() {
  const mmW = 140;
  const mmH = 90;
  const margin = 14;
  const mmX = margin;
  const mmY = canvasHeight - mmH - margin;
  const scale = 0.12;

  ctx.save();

  // 1. Render 140x90px translucent radar box in bottom-left corner
  ctx.fillStyle = 'rgba(15, 23, 42, 0.75)';
  ctx.fillRect(mmX, mmY, mmW, mmH);

  // Border & header
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(mmX, mmY, mmW, mmH);

  ctx.fillStyle = '#94a3b8';
  ctx.font = 'bold 8.5px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('📡 RADAR OVERVIEW', mmX + 6, mmY + 11);

  // Center the scaled office bounds inside the 140x90 radar box
  const mapOffsetX = mmX + Math.round((mmW - canvasWidth * scale) / 2);
  const mapOffsetY = mmY + Math.round((mmH - canvasHeight * scale) / 2) + 2;

  // Mini office perimeter bounds
  ctx.strokeStyle = '#1e293b';
  ctx.lineWidth = 1;
  ctx.strokeRect(mapOffsetX, mapOffsetY, canvasWidth * scale, canvasHeight * scale);

  // 2. Draw miniature Conference Room Alpha rectangle
  const cr = ZONES.conferenceRoom;
  ctx.fillStyle = 'rgba(2, 132, 199, 0.45)';
  ctx.fillRect(mapOffsetX + cr.x * scale, mapOffsetY + cr.y * scale, cr.w * scale, cr.h * scale);
  ctx.strokeStyle = '#0284c7';
  ctx.lineWidth = 1;
  ctx.strokeRect(mapOffsetX + cr.x * scale, mapOffsetY + cr.y * scale, cr.w * scale, cr.h * scale);

  // 3. Draw miniature Stage (Podium) rectangle
  const pd = ZONES.podium;
  ctx.fillStyle = 'rgba(202, 138, 4, 0.45)';
  ctx.fillRect(mapOffsetX + pd.x * scale, mapOffsetY + pd.y * scale, pd.w * scale, pd.h * scale);
  ctx.strokeStyle = '#ca8a04';
  ctx.lineWidth = 1;
  ctx.strokeRect(mapOffsetX + pd.x * scale, mapOffsetY + pd.y * scale, pd.w * scale, pd.h * scale);

  // 4. Draw miniature color dots for all connected teammates
  peers.forEach((peer) => {
    const px = mapOffsetX + peer.x * scale;
    const py = mapOffsetY + peer.y * scale;

    ctx.beginPath();
    ctx.arc(px, py, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = peer.isOnStage ? '#eab308' : (peer.color || '#a855f7');
    ctx.fill();

    // Active speech ripple indicator on minimap
    if (peer.isSpeaking) {
      ctx.beginPath();
      ctx.arc(px, py, 4.5, 0, Math.PI * 2);
      ctx.strokeStyle = '#22c55e';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  });

  // Local user avatar dot on minimap
  const myX = mapOffsetX + me.x * scale;
  const myY = mapOffsetY + me.y * scale;
  ctx.beginPath();
  ctx.arc(myX, myY, 3, 0, Math.PI * 2);
  ctx.fillStyle = me.isOnStage ? '#eab308' : me.color;
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1;
  ctx.stroke();

  if (me.isSpeaking) {
    ctx.beginPath();
    ctx.arc(myX, myY, 5, 0, Math.PI * 2);
    ctx.strokeStyle = '#22c55e';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  ctx.restore();
}

function drawScene(timestamp = 0) {
  ctx.clearRect(0, 0, canvasWidth, canvasHeight);

  // 1. Office Grid Background
  ctx.strokeStyle = '#1e293b';
  ctx.lineWidth = 1;
  const step = 40;
  for (let x = 0; x < canvasWidth; x += step) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvasHeight);
    ctx.stroke();
  }
  for (let y = 0; y < canvasHeight; y += step) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvasWidth, y);
    ctx.stroke();
  }

  // 2. Draw Conference Room Alpha with Frosted Glass Aesthetic
  const cr = ZONES.conferenceRoom;

  // Base semi-transparent frosted cyan glass tint
  ctx.fillStyle = 'rgba(224, 242, 254, 0.45)';
  ctx.fillRect(cr.x, cr.y, cr.w, cr.h);

  // Frosted glass specular reflection sheen gradient
  const glassSheen = ctx.createLinearGradient(cr.x, cr.y, cr.x + cr.w, cr.y + cr.h);
  glassSheen.addColorStop(0, 'rgba(255, 255, 255, 0.22)');
  glassSheen.addColorStop(0.25, 'rgba(224, 242, 254, 0.08)');
  glassSheen.addColorStop(0.5, 'rgba(255, 255, 255, 0.02)');
  glassSheen.addColorStop(0.75, 'rgba(224, 242, 254, 0.12)');
  glassSheen.addColorStop(1, 'rgba(255, 255, 255, 0.18)');
  ctx.fillStyle = glassSheen;
  ctx.fillRect(cr.x, cr.y, cr.w, cr.h);

  // Diagonal frosted glass reflection streak
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(cr.x + 35, cr.y);
  ctx.lineTo(cr.x + 105, cr.y);
  ctx.lineTo(cr.x, cr.y + 105);
  ctx.lineTo(cr.x, cr.y + 35);
  ctx.closePath();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.10)';
  ctx.fill();
  ctx.restore();

  // Interior Meeting Table with 4 Rounded Office Chairs
  const tableX = 130;
  const tableY = 142;
  const tableW = 140;
  const tableH = 66;

  // 4 Rounded Office Chairs (2 North, 2 South)
  const chairs = [
    { x: 165, y: 124, backrestY: -3 },
    { x: 235, y: 124, backrestY: -3 },
    { x: 165, y: 226, backrestY: 3 },
    { x: 235, y: 226, backrestY: 3 },
  ];
  chairs.forEach((c) => {
    // Rounded chair seat
    ctx.beginPath();
    ctx.arc(c.x, c.y, 9, 0, Math.PI * 2);
    ctx.fillStyle = '#334155';
    ctx.fill();
    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Curved backrest
    ctx.beginPath();
    ctx.arc(c.x, c.y + c.backrestY, 7, 0, Math.PI * 2);
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2;
    ctx.stroke();
  });

  // Conference Meeting Table Surface
  ctx.fillStyle = '#1e293b';
  ctx.beginPath();
  if (ctx.roundRect) {
    ctx.roundRect(tableX, tableY, tableW, tableH, 10);
  } else {
    ctx.rect(tableX, tableY, tableW, tableH);
  }
  ctx.fill();
  ctx.strokeStyle = '#0284c7';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Glass Tabletop Inlay & Central Conference Polycom Mic
  ctx.fillStyle = 'rgba(56, 189, 248, 0.12)';
  ctx.fillRect(tableX + 14, tableY + 12, tableW - 28, tableH - 24);
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.5)';
  ctx.lineWidth = 1;
  ctx.strokeRect(tableX + 14, tableY + 12, tableW - 28, tableH - 24);

  ctx.beginPath();
  ctx.arc(tableX + tableW / 2, tableY + tableH / 2, 6, 0, Math.PI * 2);
  ctx.fillStyle = '#38bdf8';
  ctx.fill();

  ctx.fillStyle = '#94a3b8';
  ctx.font = 'bold 9px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Executive Meeting Table', tableX + tableW / 2, tableY + tableH / 2 + 18);

  // Outer Frosted Glass Cyan Wall
  ctx.strokeStyle = cr.border;
  ctx.lineWidth = 4;
  ctx.strokeRect(cr.x, cr.y, cr.w, cr.h);

  // Check if any avatars are inside Conference Room Alpha
  const isAvatarInsideRoom = inRect(me.x, me.y, cr) || Array.from(peers.values()).some((p) => inRect(p.x, p.y, cr));

  if (isAvatarInsideRoom) {
    // Prominent Glowing Status Sign: 🔒 PRIVATE MEETING IN PROGRESS
    ctx.save();
    const signText = '🔒 PRIVATE MEETING IN PROGRESS';
    ctx.font = 'bold 11px sans-serif';
    const textWidth = ctx.measureText(signText).width;
    const signW = textWidth + 24;
    const signH = 26;
    const signX = cr.x + (cr.w - signW) / 2;
    const signY = cr.y + 12;

    // Glowing cyan pulse effect
    const glowPulse = 12 + Math.sin(timestamp * 0.005) * 4;
    ctx.shadowColor = '#38bdf8';
    ctx.shadowBlur = glowPulse;

    ctx.fillStyle = 'rgba(2, 132, 199, 0.92)';
    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(signX, signY, signW, signH, 6);
    } else {
      ctx.rect(signX, signY, signW, signH);
    }
    ctx.fill();

    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.shadowBlur = 0;
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(signText, cr.x + cr.w / 2, signY + signH / 2);
    ctx.restore();
  } else {
    // Available status header
    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('🔒 Conference Room Alpha (Soundproof)', cr.x + 12, cr.y + 26);
  }

  // 3. Draw Town Hall Stage & Podium with Animated Spotlight Beam
  const podium = ZONES.podium;
  ctx.fillStyle = podium.fill;
  ctx.fillRect(podium.x, podium.y, podium.w, podium.h);
  ctx.strokeStyle = podium.border;
  ctx.lineWidth = 3;
  ctx.strokeRect(podium.x, podium.y, podium.w, podium.h);

  // When a user steps onto the podium (isOnStage === true)
  const isPodiumActive = me.isOnStage || Array.from(peers.values()).some((p) => p.isOnStage);

  if (isPodiumActive) {
    ctx.save();
    // Gentle breathing pulse for animated spotlight effect
    const pulse = Math.sin(timestamp * 0.003) * 6;
    const spotlightRadius = 120 + pulse;

    // Overhead beam cone shining from the ceiling (y = 0) down to the podium
    ctx.beginPath();
    ctx.moveTo(podium.x + 90 - 24, 0); // Ceiling fixture
    ctx.lineTo(podium.x + 90 + 24, 0);
    ctx.lineTo(podium.x + podium.w + 20, podium.y + podium.h);
    ctx.lineTo(podium.x - 20, podium.y + podium.h);
    ctx.closePath();

    const beamGrad = ctx.createLinearGradient(podium.x + 90, 0, podium.x + 90, podium.y + podium.h);
    beamGrad.addColorStop(0, 'rgba(250, 204, 21, 0.35)');
    beamGrad.addColorStop(0.35, 'rgba(250, 204, 21, 0.16)');
    beamGrad.addColorStop(1, 'rgba(250, 204, 21, 0.02)');
    ctx.fillStyle = beamGrad;
    ctx.fill();

    // Soft golden radial gradient cone shining onto the podium
    const grad = ctx.createRadialGradient(
      podium.x + 90,
      podium.y + 60,
      10,
      podium.x + 90,
      podium.y + 60,
      spotlightRadius
    );
    grad.addColorStop(0, 'rgba(250, 204, 21, 0.6)');
    grad.addColorStop(1, 'rgba(250, 204, 21, 0)');

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(podium.x + 90, podium.y + 60, spotlightRadius, 0, Math.PI * 2);
    ctx.fill();

    // Golden glow border for the stage
    ctx.shadowColor = '#eab308';
    ctx.shadowBlur = 14 + pulse;
    ctx.strokeStyle = '#fde047';
    ctx.lineWidth = 3.5;
    ctx.strokeRect(podium.x, podium.y, podium.w, podium.h);
    ctx.restore();
  }

  // Interactive presentation board mounted on the wall behind the stage
  ctx.save();
  if (isPresentationBoardHovered) {
    ctx.shadowColor = '#38bdf8';
    ctx.shadowBlur = 12;
  }
  ctx.fillStyle = '#78350f';
  ctx.fillRect(PRESENTATION_BOARD.x, PRESENTATION_BOARD.y, PRESENTATION_BOARD.w, PRESENTATION_BOARD.h);
  ctx.strokeStyle = '#fbbf24';
  ctx.lineWidth = 2;
  ctx.strokeRect(PRESENTATION_BOARD.x, PRESENTATION_BOARD.y, PRESENTATION_BOARD.w, PRESENTATION_BOARD.h);
  ctx.shadowBlur = 0;

  const boardInset = 5;
  const boardX = PRESENTATION_BOARD.x + boardInset;
  const boardY = PRESENTATION_BOARD.y + boardInset;
  const boardW = PRESENTATION_BOARD.w - boardInset * 2;
  const boardH = PRESENTATION_BOARD.h - boardInset * 2;
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(boardX, boardY, boardW, boardH);
  ctx.strokeStyle = isPresentationBoardHovered ? '#38bdf8' : '#cbd5e1';
  ctx.lineWidth = 1;
  ctx.strokeRect(boardX, boardY, boardW, boardH);

  ctx.fillStyle = '#0f172a';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 8px sans-serif';
  if (timestamp < presentationNoticeUntil) {
    ctx.fillText('Screen sharing is not available yet', boardX + boardW / 2, boardY + boardH / 2);
  } else {
    ctx.fillText('Click to Share Screen', boardX + boardW / 2, boardY + 13);
    ctx.fillText('/ Slide Presentation', boardX + boardW / 2, boardY + 26);
  }
  ctx.restore();

  ctx.fillStyle = '#fde047';
  ctx.font = 'bold 13px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('🎙️ Town Hall Stage (Broadcast)', podium.x + 10, podium.y + 24);

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
    // Draw 2 concentric pulsing green rings if peer is speaking
    drawVoiceActivityRipples(peer, timestamp);

    ctx.beginPath();
    ctx.arc(peer.x, peer.y, peer.radius || 14, 0, Math.PI * 2);
    ctx.fillStyle = peer.isOnStage ? '#eab308' : peer.color;
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Draw directional gaze & facing indicators
    drawFacingIndicator(peer.x, peer.y, peer.radius || 14, peer.facingAngle);

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
  // Draw 2 concentric pulsing green rings if local user is speaking
  drawVoiceActivityRipples(me, timestamp);

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

  // 8. Radar Minimap Overview HUD (bottom-left corner)
  drawRadarMinimap();
}

// 60 FPS Render Loop
function animate(timestamp = 0) {
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

  // Natural speaking cadence simulation for mock stage speaker (Nikhil)
  if (!isLiveSocket) {
    const nikhil = peers.get('p-2');
    if (nikhil) {
      // Natural speech cadence: speaking for 2.4s, brief 0.8s pause between phrases
      nikhil.isSpeaking = (timestamp % 3200) < 2400;
    }
  }

  updateHUD();
  drawScene(timestamp);
  requestAnimationFrame(animate);
}

requestAnimationFrame(animate);
