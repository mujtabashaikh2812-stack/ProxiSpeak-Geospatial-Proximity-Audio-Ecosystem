// One shared AudioContext for the whole app.
let ctx = null;

export function getAudioContext() {
  if (!ctx) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    ctx = new AudioCtx();
  }
  return ctx;
}

// Browsers block audio until a user click, so call this from a click handler.
export async function resumeAudioContext() {
  const c = getAudioContext();
  if (c.state === 'suspended') await c.resume();
  return c;
}