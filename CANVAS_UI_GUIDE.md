# ProxiSpeak 2D Canvas UI Guide

This guide describes the requested 1100 × 700 px canvas design and the current
canvas interactions. Coordinates below are canvas/world pixels, with `(0, 0)` at
the top-left; positive X points right and positive Y points down.

## Canvas dimensions

- **Design target:** 1100 × 700 px.
- **Current implementation:** 980 × 620 px, as declared by the `<canvas>` in
  `index.html`. The renderer reads these intrinsic dimensions and sizes the CSS
  canvas to match them. It scales the backing store for the browser's device
  pixel ratio without changing world coordinates.
- Zone, furniture, and initial player positions are currently authored in the
  existing world coordinate system; they are not automatically rescaled to the
  1100 × 700 design target. Update the canvas element and review the layout
  together if the design target is adopted in the running UI.
- The background grid uses 40 px spacing. Player centers stay at least 30 px
  from each canvas edge.

## Acoustic zones and spatial coordinates

Rectangles use `(x, y, width, height)`. The zone checks include their rectangle
edges. The room and stage set the local player's displayed zone when the
player's center is inside their respective rectangle.

| Area | Coordinates (px) | Behavior |
|---|---:|---|
| Conference Room Alpha | `x=60, y=60, w=280, h=220` (right=340, bottom=280) | Marked soundproof/private in the UI. |
| Town Hall Stage & Podium | `x=680, y=80, w=180, h=120` (right=860, bottom=200) | Players on the stage are marked as broadcasting to the office in the UI. |
| Presentation board | `x=680, y=26, w=180, h=48` (right=860, bottom=74) | Click to show the temporary “Screen sharing is not available yet” notice. |
| Open workspace desks | Team Pod A `(440,380,120,70)`; Team Pod B `(620,380,120,70)`; Team Pod C `(800,380,120,70)` | Visual furniture; these rectangles do not define acoustic zones. |

Proximity audio status uses a **100 px Euclidean earshot radius** between player
centers (`distance ≤ 100 px` is shown as in earshot). A dashed 100 px circle is
drawn around the local avatar. The conference-room and podium rectangles
determine the displayed zone/stage state; they are separate from that distance
check. These are client-side visual/status behaviors; the canvas code alone
does not enforce soundproofing or implement an audio broadcast.

## Avatar sprite specifications

Avatars are rendered as Canvas circles, not image sprites:

- **Center:** player world position `(x, y)`; initial local position `(220, 260)`.
- **Body:** 14 px radius (28 px diameter), filled with the selected avatar color
  and outlined in white. The local outline is 2.5 px; peer outlines are 2 px.
- **Colors:** the local avatar defaults to Sky Blue `#38bdf8`; the customization
  drawer also offers Emerald Green `#10b981`, Purple `#a855f7`, Amber `#f59e0b`,
  and Rose Pink `#f43f5e`. Remote peers use the color supplied for them, with
  Purple `#a855f7` as the client-side default.
- **Stage state:** the body fill changes to gold `#eab308`.
- **Facing:** a small white forward-pointing triangle and two white 2.2 px-radius
  eye dots rotate with the facing angle.
- **Label:** the display name is centered above the avatar. The local name uses
  bold 12 px text; peer names use 11 px text.
- **Speaking:** two expanding green ripple rings indicate active speaking.
- **Movement:** keyboard movement is 4 px per animation frame; diagonal motion
  is normalized to the same speed.

## Keyboard, mouse, and touch controls

| Input | Action |
|---|---|
| `W` / `A` / `S` / `D` | Move up / left / down / right. |
| `↑` / `←` / `↓` / `→` | Move up / left / down / right. |
| `M` | Toggle app-level mute; while muted, Space/V push-to-talk is suppressed. |
| `C` | Open the avatar customization drawer (ignored while typing in a text field). |
| Hold `Space` or `V` | Activate push-to-talk while held; release to stop transmitting. |
| `Escape` | Close the avatar customization drawer when it is open. |
| Click **Customize Avatar** | Open or toggle the customization drawer. |
| Click the drawer close button or backdrop | Close the customization drawer. |
| Click a color swatch | Change the avatar color. |
| Click **Walk to** beside a coworker | Start walking toward that coworker; click **Stop** to cancel. |
| Move the pointer over the presentation board | Highlight it and show a pointer cursor. |
| Click the presentation board | Show a temporary screen-sharing-unavailable notice. |
| Hold a virtual D-pad direction on a touch screen | Move in that direction; release to stop. |

Canvas clicks do not move the avatar. The `M` shortcut suppresses the app's
push-to-talk speaking state; it does not control an operating-system microphone
or audio capture device. The Day 20 hint is displayed in the controls panel and
as its hover tooltip.

## Source of truth

The current dimensions, coordinates, sprite drawing, and input behavior are
implemented in `index.html` and `app.js`; visual layout and touch-control styling
are in `style.css`.
