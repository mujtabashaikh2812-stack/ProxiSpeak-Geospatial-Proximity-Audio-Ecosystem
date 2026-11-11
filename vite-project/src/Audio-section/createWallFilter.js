import { getAudioContext } from "./AudioContext";

const MUFFLED_HZ = 800;
const OPEN_HZ = 22000;

export const createWallFilter = () => {
  const filter = getAudioContext().createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = OPEN_HZ;
  return filter;
};

export const setOccluded = (filter, occluded) => {
  const { currentTime } = getAudioContext();
  filter.frequency.setTargetAtTime(occluded ? MUFFLED_HZ : OPEN_HZ, currentTime, 0.05);
};

const side = (p, a, b) => Math.sign((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x));

// True if the line between two people crosses the wall.
// wall = { a: {x, y}, b: {x, y} }
export const isBlockedByWall = (me, other, wall) =>
  side(me, wall.a, wall.b) !== side(other, wall.a, wall.b) &&
  side(wall.a, me, other) !== side(wall.b, me, other);