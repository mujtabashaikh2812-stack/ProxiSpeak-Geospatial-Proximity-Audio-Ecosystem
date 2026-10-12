export const EARSHOT_RADIUS = 100; // px, from the project schedule
export const MIN_VOLUME = 0.1; // 10% at the edge of the radius

export function distanceBetween(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

// 100% when standing together, falling in a straight line to 10% at the edge.
// Outside the radius the voice is silent.
export function volumeForDistance(distance, radius = EARSHOT_RADIUS) {
  if (distance >= radius) return 0;
  return 1 - (distance / radius) * (1 - MIN_VOLUME);
}