export const OPEN_FREQ = 20000; // clear sound
export const OCCLUDED_FREQ = 500; // muffled, like speech through a wall
export const OCCLUDED_GAIN = 0.5; // extra volume drop behind a wall

// Does the straight line a -> b pass through the rectangle r = { x, y, w, h }?
function segmentHitsRect(a, b, r) {
  let t0 = 0;
  let t1 = 1;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const p = [-dx, dx, -dy, dy];
  const q = [a.x - r.x, r.x + r.w - a.x, a.y - r.y, r.y + r.h - a.y];

  for (let i = 0; i < 4; i += 1) {
    if (p[i] === 0) {
      if (q[i] < 0) return false;
    } else {
      const t = q[i] / p[i];
      if (p[i] < 0) {
        if (t > t1) return false;
        if (t > t0) t0 = t;
      } else {
        if (t < t0) return false;
        if (t < t1) t1 = t;
      }
    }
  }
  return true;
}

// walls = [{ x, y, w, h }, ...] in the same pixel units as the player positions.
export function hasLineOfSight(a, b, walls = []) {
  return !walls.some((wall) => segmentHitsRect(a, b, wall));
}