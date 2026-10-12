const UNITS_PER_PIXEL = 1 / 20; // keeps positions in a range HRTF sounds good with

export function createSpatialPanner(ctx) {
  const panner = ctx.createPanner();
  panner.panningModel = 'HRTF'; // best left/right feel on headphones
  panner.distanceModel = 'inverse';
  panner.refDistance = 1;
  panner.rolloffFactor = 0; // no volume change here, the GainNode handles volume
  return panner;
}

// dx, dy = other player's position minus your position, in canvas pixels.
// Canvas x goes right, canvas y goes down. The listener faces "up" the screen,
// so a negative dy (above you) is in front of you and a positive dy is behind.
export function setPannerPosition(panner, dx, dy) {
  const x = dx * UNITS_PER_PIXEL;
  const z = dy * UNITS_PER_PIXEL;

  if (panner.positionX) {
    const t = panner.context.currentTime;
    panner.positionX.setTargetAtTime(x, t, 0.05);
    panner.positionY.setTargetAtTime(0, t, 0.05);
    panner.positionZ.setTargetAtTime(z, t, 0.05);
  } else {
    panner.setPosition(x, 0, z); // older Safari
  }
}