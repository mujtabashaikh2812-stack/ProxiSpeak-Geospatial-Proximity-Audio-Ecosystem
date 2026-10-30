# Infotact Solutions Internship — Group 3
## Individual Sprint & Daily Commit Roadmap (Phase 2: Days 8–20)

**Assigned To:** Nedunuri Akhila  
**Role:** 2D Canvas & UI Interaction Engineer (Frontend Pod)  
**Dedicated Branch:** `dev-akhila`  
**GitHub Repository:** `https://github.com/mujtabashaikh2812-stack/ProxiSpeak-Geospatial-Proximity-Audio-Ecosystem`  
**Supervisor / Team Lead:** Mujtaba Shaikh (`lead-mujtaba`)  
**Date Issued:** October 30, 2026  

---

### 🚨 CRITICAL URGENCY: SOP Streak & Disqualification Warning

> **Infotact SOP Rule 4.2:** Every intern must log **at least 1 meaningful commit per calendar day across 20 distinct days** on their dedicated branch to remain eligible for the internship stipend and final review certification.
>
> **Your Current Streak Status:** You currently have **only 2 commits in total** on `origin/dev-akhila` (`27696db` on Oct 25 and `e836966` on Oct 26). You are currently at **2 out of 20 days** logged. You are in immediate danger of dashboard disqualification.  
> You must resume committing **TODAY (October 30)** and push every single day without interruption through **November 11** to reach the 20-day milestone.

---

### 🎯 Your Phase 2 Mission & Architecture Overview

During Phase 1, you built our 2D HTML5 Canvas world (`app.js`, `index.html`, `style.css`), keyboard WASD navigation, the 100-pixel earshot proximity circle, Conference Room Alpha, and the Town Hall Podium.

In Phase 2 (Weeks 3 & 4), your mission is to elevate our 2D office from a basic prototype into a **fluid, beautifully polished 60 FPS interactive virtual workspace**:
1. **Linear Coordinate Interpolation (Lerp):** Currently, when remote coworkers move, their avatars snap/teleport abruptly. You must implement smooth 60 FPS interpolation so remote players glide seamlessly across the floor.
2. **Avatar Directional Gaze:** Add eyes or directional indicators so you can see whether a coworker is facing towards you or away from you.
3. **Audio Speaking Ripples:** Draw animated pulsing green soundwave rings around avatars when they speak (tied to their microphone levels).
4. **Interactive Office Radar Minimap:** Render a sleek, translucent radar map in the corner showing the entire office layout and green teammate blips.
5. **Visual Acoustic Polish:** Add frosted glass reflections and "Private Meeting" status signs to Conference Room Alpha, plus a glowing golden spotlight cone shining down on the Town Hall Podium when occupied.
6. **Customization & Sidebar HUD:** Build an avatar shirt color picker, custom name tag editor, and a live coworker directory with distance badges.

---

### 📅 Day-by-Day Commit Schedule (Days 8 to 20)

Follow this exact schedule. Make sure each commit exceeds 50+ changed characters and contains working code and components.

```
┌──────┬────────┬────────────────────────────────────────────────────────────────────────┐
│ Day  │ Date   │ Deliverable Summary                                                    │
├──────┼────────┼────────────────────────────────────────────────────────────────────────┤
│ D08  │ Oct 30 │ 60 FPS Linear Interpolation (Lerp) for Smooth Remote Avatar Movement   │
│ D09  │ Oct 31 │ Directional Gaze & Avatar Facing Orientation Indicators (N, S, E, W)  │
│ D10  │ Nov 01 │ Real-Time Voice Activity Ripple Animation Around Speaking Avatars      │
│ D11  │ Nov 02 │ Translucent Radar Minimap Overview HUD in Bottom-Left Corner           │
│ D12  │ Nov 03 │ Frosted Glass Aesthetic & Meeting Status Banner for Conference Alpha   │
│ D13  │ Nov 04 │ Animated Golden Spotlight Beam Shining on Town Hall Stage Podium       │
│ D14  │ Nov 05 │ Avatar Customization Drawer: Shirt Color Picker & Custom Name Tag      │
│ D15  │ Nov 06 │ Interactive Coworker Sidebar Roster with Distance Badges & Auto-Walk  │
│ D16  │ Nov 07 │ On-Screen Virtual Touch D-Pad / Joystick for Mobile & Tablet Devices   │
│ D17  │ Nov 08 │ High-DPI Retina Display Canvas Auto-Scaling (DevicePixelRatio Fix)     │
│ D18  │ Nov 09 │ Virtual Presentation Board Surface on Town Hall Stage Wall             │
│ D19  │ Nov 10 │ Comprehensive 2D Canvas UI Styling & Keyboard Shortcuts Guide          │
│ D20  │ Nov 11 │ Final Frontend Polish, Zero-Glitch Render Loop Audit, and v1.0.0 Tag   │
└──────┴────────┴────────────────────────────────────────────────────────────────────────┘
```

---

### 🛠️ Detailed Implementation Guide by Day

#### 🔹 Day 8 (Oct 30 — TODAY): 60 FPS Linear Interpolation (Lerp)
* **Task:** In `app.js`, prevent remote avatars from teleporting when receiving `player:moved`.
  * Store target coordinates: `peer.targetX = data.canvasX; peer.targetY = data.canvasY;`.
  * In your `requestAnimationFrame` loop, smoothly interpolate current position towards target position:
    ```js
    const LERP_FACTOR = 0.2;
    peer.x += (peer.targetX - peer.x) * LERP_FACTOR;
    peer.y += (peer.targetY - peer.y) * LERP_FACTOR;
    ```
  * Avatars now glide smoothly and naturally across the floor!
* **File to Edit:** `app.js`.
* **Commit Message:**
  ```bash
  git commit -m "feat(lerp): implement smooth coordinate linear interpolation for remote avatars"
  ```

#### 🔹 Day 9 (Oct 31): Directional Gaze & Facing Indicators
* **Task:** In `app.js`:
  * Track movement direction: `facingAngle = Math.atan2(dy, dx)`.
  * When rendering each avatar circle, draw two small white pupil dots or a subtle directional triangle indicating whether the character is facing North, South, East, or West.
* **File to Edit:** `app.js`.
* **Commit Message:**
  ```bash
  git commit -m "feat(avatar): add directional gaze and avatar facing indicators"
  ```

#### 🔹 Day 10 (Nov 01): Voice Activity Ripple Animation
* **Task:** In `app.js` and `style.css`:
  * If a peer or the local user is speaking (`isSpeaking === true` or volume > threshold):
  * Draw 2 concentric pulsing green rings expanding outward from the avatar radius:
    ```js
    ctx.strokeStyle = `rgba(34, 197, 94, ${1 - rippleProgress})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.radius + rippleProgress * 15, 0, Math.PI * 2);
    ctx.stroke();
    ```
  * Visually communicates who is speaking without glancing at a text HUD.
* **Files to Edit:** `app.js`, `style.css`.
* **Commit Message:**
  ```bash
  git commit -m "feat(ui): add visual speaking ripple animation around active avatars"
  ```

#### 🔹 Day 11 (Nov 02): Radar Minimap Overview HUD
* **Task:** In `app.js`:
  * Render a 140x90px translucent radar box in the bottom-left corner (`ctx.fillStyle = 'rgba(15, 23, 42, 0.75)'`).
  * Scale down office bounds (scale factor ~0.12).
  * Draw miniature rectangles for Conference Room Alpha and Stage.
  * Draw miniature color dots for all connected teammates.
* **Files to Edit:** `app.js`, `style.css`.
* **Commit Message:**
  ```bash
  git commit -m "feat(minimap): render radar minimap in bottom-left corner with player dots"
  ```

#### 🔹 Day 12 (Nov 03): Frosted Glass Aesthetic for Conference Room Alpha
* **Task:** In `app.js` and `style.css`:
  * Draw semi-transparent frosted cyan glass tint (`rgba(224, 242, 254, 0.45)`).
  * Render interior meeting table with 4 rounded office chairs.
  * If avatars are inside, display a prominent glowing status sign: `🔒 PRIVATE MEETING IN PROGRESS`.
* **Files to Edit:** `app.js`, `style.css`.
* **Commit Message:**
  ```bash
  git commit -m "feat(visuals): polish Conference Room Alpha with frosted glass reflections"
  ```

#### 🔹 Day 13 (Nov 04): Animated Golden Spotlight on Town Hall Podium
* **Task:** In `app.js`:
  * When a user steps onto the podium (`isOnStage === true`):
  * Draw a soft golden radial gradient cone shining from the ceiling down to the podium:
    ```js
    const grad = ctx.createRadialGradient(podium.x + 90, podium.y + 60, 10, podium.x + 90, podium.y + 60, 120);
    grad.addColorStop(0, 'rgba(250, 204, 21, 0.6)');
    grad.addColorStop(1, 'rgba(250, 204, 21, 0)');
    ```
  * Adds high-impact visual feedback when an executive or presenter addresses the company.
* **File to Edit:** `app.js`.
* **Commit Message:**
  ```bash
  git commit -m "feat(stage): render animated spotlight beam on Town Hall Stage Podium"
  ```

#### 🔹 Day 14 (Nov 05): Avatar Customization Drawer
* **Task:** In `index.html`, `style.css`, and `app.js`:
  * Add a collapsible slide-out drawer on the left side.
  * Include a color palette (Sky Blue, Emerald Green, Purple, Amber, Rose Pink) allowing users to customize their avatar color.
  * Add an input text box to change display name and role title (e.g. "Akhila (Lead)").
* **Files to Edit:** `index.html`, `style.css`, `app.js`.
* **Commit Message:**
  ```bash
  git commit -m "feat(customization): add avatar color picker and display name editor drawer"
  ```

#### 🔹 Day 15 (Nov 06): Coworker Sidebar Roster with Live Distance Badges
* **Task:** In `index.html`, `style.css`, and `app.js`:
  * Render an interactive coworker list in the sidebar.
  * For each peer, display distance in pixels: `Bob: 45px (In Earshot 🟢)` or `Charlie: 280px (Out of Range ⚪)`.
  * Add a "Walk to" button: clicking it sets an auto-navigation target so the avatar automatically walks towards that coworker.
* **Files to Edit:** `index.html`, `style.css`, `app.js`.
* **Commit Message:**
  ```bash
  git commit -m "feat(sidebar): build interactive coworker roster with live distance badges"
  ```

#### 🔹 Day 16 (Nov 07): On-Screen Virtual Touch D-Pad / Joystick
* **Task:** In `index.html`, `style.css`, and `app.js`:
  * Add on-screen virtual arrow buttons in the bottom-right corner for touchscreens / tablets.
  * Bind `touchstart` and `touchend` events to simulate `WASD` keyboard events.
* **Files to Edit:** `index.html`, `style.css`, `app.js`.
* **Commit Message:**
  ```bash
  git commit -m "feat(controls): add on-screen virtual D-Pad / Joystick for touch devices"
  ```

#### 🔹 Day 17 (Nov 08): High-DPI Retina Canvas Auto-Scaling
* **Task:** In `app.js`:
  * Fix canvas blurriness on MacBooks and 4K laptops using `window.devicePixelRatio`:
    ```js
    const dpr = window.devicePixelRatio || 1;
    canvas.width = 1100 * dpr;
    canvas.height = 700 * dpr;
    canvas.style.width = '1100px';
    canvas.style.height = '700px';
    ctx.scale(dpr, dpr);
    ```
  * Ensures pixel-perfect, razor-sharp text and graphics on all screens.
* **File to Edit:** `app.js`.
* **Commit Message:**
  ```bash
  git commit -m "feat(responsive): implement canvas auto-scaling for high-DPI Retina screens"
  ```

#### 🔹 Day 18 (Nov 09): Virtual Presentation Whiteboard Surface
* **Task:** In `app.js`:
  * Draw an interactive presentation whiteboard frame mounted on the wall behind the Town Hall stage.
  * Display a placeholder "Click to Share Screen / Slide Presentation" surface.
* **File to Edit:** `app.js`.
* **Commit Message:**
  ```bash
  git commit -m "feat(whiteboard): add virtual presentation board on Town Hall Stage wall"
  ```

#### 🔹 Day 19 (Nov 10): 2D Canvas UI Documentation Guide
* **Task:** Create `CANVAS_UI_GUIDE.md`:
  * Document canvas dimensions (1100x700px), acoustic zone coordinates, avatar sprite specifications, and keyboard/mouse shortcut mapping.
* **File to Create:** `CANVAS_UI_GUIDE.md`.
* **Commit Message:**
  ```bash
  git commit -m "docs: create UI style guide and 2D canvas rendering documentation"
  ```

#### 🔹 Day 20 (Nov 11): Final Visual Polish & v1.0.0 Tagging
* **Task:** Clean up code, add keyboard shortcut hints tooltip (`[WASD] Move | [M] Mute | [C] Color Drawer`), remove debug logs, and prepare release build.
* **Commit Message:**
  ```bash
  git commit -m "chore: finalize frontend polish, remove console logs, and tag v1.0.0"
  ```

---

### 🚀 Daily Git Workflow (Commands to Run)

Run these commands inside your terminal every day:
```bash
# 1. Ensure you are on your dedicated branch
git checkout dev-akhila

# 2. Stage your changes
git status
git add .

# 3. Commit with today's mandatory message (>50 characters)
git commit -m "feat(...): descriptive message for today"

# 4. Push to remote GitHub to record your daily streak
git push origin dev-akhila
```

> **Lead Support:** If you need assistance with canvas context math, gradient fills, or linear interpolation logic, message **Mujtaba** right away. Let's make sure Day 8 is committed and pushed today!
