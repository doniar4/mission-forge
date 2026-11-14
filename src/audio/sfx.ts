/*
 * Game sounds, synthesised on the fly with the Web Audio API: no sound files to download and no
 * one else's recordings to license. Every sound is short and quiet; the launch rumble is the only
 * long one and it fades by itself.
 *
 * Browsers start audio only after the player has clicked or pressed a key, so the context is
 * created lazily on the first sound and resumed whenever it was suspended.
 */

export type Sfx =
  | 'tick' // moving between stages
  | 'select' // a part fitted
  | 'deselect' // a part taken off
  | 'deny' // an action that is not allowed
  | 'beep' // a countdown second
  | 'ignition' // engines start: the rumble of the climb
  | 'stage' // stage separation, fairing jettison
  | 'deploy' // the spacecraft is released
  | 'event' // something happened in flight (a warning, a storm)
  | 'success'
  | 'failure';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = false;
let rumble: { stop: (fade: number) => void } | null = null;

export function setMuted(on: boolean) {
  muted = on;
  if (on) stopRumble(0.2);
  if (master && ctx) master.gain.setTargetAtTime(on ? 0 : 0.5, ctx.currentTime, 0.05);
}

function audio(): { ctx: AudioContext; out: GainNode } | null {
  if (muted || typeof window === 'undefined') return null;
  try {
    if (!ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') void ctx.resume();
    return { ctx, out: master! };
  } catch {
    return null;
  }
}

/** A short tone with a quick attack and an exponential fade. */
function tone(freq: number, dur: number, opts: { type?: OscillatorType; gain?: number; at?: number; glide?: number } = {}) {
  const a = audio();
  if (!a) return;
  const t0 = a.ctx.currentTime + (opts.at ?? 0);
  const osc = a.ctx.createOscillator();
  const g = a.ctx.createGain();
  osc.type = opts.type ?? 'sine';
  osc.frequency.setValueAtTime(freq, t0);
  if (opts.glide) osc.frequency.exponentialRampToValueAtTime(opts.glide, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(opts.gain ?? 0.2, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(a.out);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

function noiseBuffer(c: AudioContext, seconds: number): AudioBuffer {
  const buf = c.createBuffer(1, Math.floor(c.sampleRate * seconds), c.sampleRate);
  const data = buf.getChannelData(0);
  // Brown noise: deep, like a distant engine, rather than the hiss of white noise.
  let last = 0;
  for (let i = 0; i < data.length; i++) {
    last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
    data[i] = last * 3.5;
  }
  return buf;
}

/** A burst of filtered noise: a thud, a pop, a hiss. */
function burst(dur: number, freq: number, gain: number) {
  const a = audio();
  if (!a) return;
  const src = a.ctx.createBufferSource();
  src.buffer = noiseBuffer(a.ctx, dur);
  const f = a.ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = freq;
  const g = a.ctx.createGain();
  const t0 = a.ctx.currentTime;
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(f).connect(g).connect(a.out);
  src.start(t0);
}

/** The engines: a low roar that swells, holds, and fades when stopRumble is called (or after `seconds`). */
function startRumble(seconds: number) {
  stopRumble(0.1);
  const a = audio();
  if (!a) return;
  const src = a.ctx.createBufferSource();
  src.buffer = noiseBuffer(a.ctx, 4);
  src.loop = true;
  const f = a.ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = 380;
  const g = a.ctx.createGain();
  const t0 = a.ctx.currentTime;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(0.9, t0 + 1.2);
  // The air thins on the way up: the roar dulls and quietens.
  f.frequency.setValueAtTime(380, t0 + 1.2);
  f.frequency.exponentialRampToValueAtTime(140, t0 + seconds);
  g.gain.setValueAtTime(0.9, t0 + 1.2);
  g.gain.exponentialRampToValueAtTime(0.25, t0 + seconds);
  src.connect(f).connect(g).connect(a.out);
  src.start(t0);
  const handle = {
    stop: (fade: number) => {
      const now = a.ctx.currentTime;
      g.gain.cancelScheduledValues(now);
      g.gain.setValueAtTime(Math.max(0.0001, g.gain.value), now);
      g.gain.exponentialRampToValueAtTime(0.0001, now + Math.max(0.05, fade));
      src.stop(now + Math.max(0.05, fade) + 0.05);
      if (rumble === handle) rumble = null;
    },
  };
  rumble = handle;
  src.onended = () => {
    if (rumble === handle) rumble = null;
  };
  src.stop(t0 + seconds + 2);
}

export function stopRumble(fade = 0.8) {
  rumble?.stop(fade);
}

export function play(s: Sfx) {
  switch (s) {
    case 'tick':
      return tone(1400, 0.05, { type: 'triangle', gain: 0.05 });
    case 'select':
      tone(660, 0.09, { type: 'triangle', gain: 0.12 });
      return tone(990, 0.12, { type: 'triangle', gain: 0.1, at: 0.06 });
    case 'deselect':
      return tone(520, 0.12, { type: 'triangle', gain: 0.1, glide: 360 });
    case 'deny':
      return tone(180, 0.18, { type: 'square', gain: 0.06 });
    case 'beep':
      return tone(880, 0.12, { type: 'sine', gain: 0.18 });
    case 'ignition':
      tone(1320, 0.4, { type: 'sine', gain: 0.2 });
      return startRumble(40);
    case 'stage':
      return burst(0.5, 900, 0.7);
    case 'deploy':
      burst(0.25, 2400, 0.25);
      return tone(1200, 0.25, { type: 'sine', gain: 0.08, at: 0.1, glide: 1600 });
    case 'event':
      return tone(740, 0.16, { type: 'triangle', gain: 0.09 });
    case 'success':
      stopRumble(1);
      [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.5, { type: 'triangle', gain: 0.12, at: i * 0.11 }));
      return;
    case 'failure':
      stopRumble(0.3);
      tone(330, 0.5, { type: 'sawtooth', gain: 0.06, glide: 160 });
      return tone(220, 0.7, { type: 'sine', gain: 0.1, at: 0.1, glide: 110 });
  }
}
