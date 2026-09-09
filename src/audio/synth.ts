/**
 * Procedural sound: every cue and ambience bed is synthesized from oscillators and
 * filtered noise, so the site ships zero audio assets. This file only builds WebAudio
 * graphs against any `BaseAudioContext` (real or offline); `audio.ts` owns the live
 * context, the store subscriptions and the on/off logic.
 *
 * Levels: the whole mix passes through a memoryless soft ceiling at -18 dBFS
 * (`ceilingCurve`), and every source is designed to sit well below it: cues peak around
 * -22 dB, ambience beds around -30 dB. Nothing here is loud by construction.
 */

export type CueName = 'select' | 'hover' | 'cockpitOn' | 'cockpitOff' | 'ignition' | 'launch' | 'terminal';
export type AmbienceFamily = 'silence' | 'space' | 'cockpit';

export const CUE_NAMES: readonly CueName[] = ['select', 'hover', 'cockpitOn', 'cockpitOff', 'ignition', 'launch', 'terminal'];

/** Linear amplitude of -18 dBFS. The output stage never exceeds it. */
export const CEILING = 0.125;
/** Exponential ramps cannot reach zero; this is "silent". */
const FLOOR = 0.0001;

export const gainToDb = (g: number): number => 20 * Math.log10(Math.max(g, 1e-9));

// ---------------------------------------------------------------------------
// Shared building blocks
// ---------------------------------------------------------------------------

const noiseCache = new WeakMap<BaseAudioContext, AudioBuffer>();

/** Two seconds of deterministic white noise, generated once per context and looped. */
function noiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  let buf = noiseCache.get(ctx);
  if (buf) return buf;
  const len = Math.max(1, Math.floor(ctx.sampleRate * 2));
  buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  let seed = 0x2f6e2b17;
  for (let i = 0; i < len; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    data[i] = (seed / 0xffffffff) * 2 - 1;
  }
  noiseCache.set(ctx, buf);
  return buf;
}

/** Soft ceiling: linear below 55% of the ceiling, then a tanh knee that never exceeds it. */
function ceilingCurve(n = 4097): Float32Array<ArrayBuffer> {
  const knee = CEILING * 0.55;
  const span = CEILING - knee;
  const out = new Float32Array(new ArrayBuffer(n * 4));
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    const a = Math.abs(x);
    const y = a <= knee ? a : knee + span * Math.tanh((a - knee) / span);
    out[i] = Math.sign(x) * y;
  }
  return out;
}

export interface OutputStage {
  /** Everything (cues and beds) connects here. */
  input: GainNode;
  /** 0..1 enable/disable fader, ramped by the owner. */
  master: GainNode;
}

export function createOutputStage(ctx: BaseAudioContext, destination: AudioNode, masterGain = 0): OutputStage {
  const input = ctx.createGain();
  input.gain.value = 1;
  const ceiling = ctx.createWaveShaper();
  ceiling.curve = ceilingCurve();
  ceiling.oversample = 'none';
  const master = ctx.createGain();
  master.gain.value = masterGain;
  input.connect(ceiling);
  ceiling.connect(master);
  master.connect(destination);
  return { input, master };
}

/** A small graph with a shared lifetime: start every source, stop every source, tear down. */
class Voice {
  private readonly nodes: AudioNode[] = [];
  private readonly sources: AudioScheduledSourceNode[] = [];

  constructor(readonly ctx: BaseAudioContext) {}

  gain(value: number): GainNode {
    const g = this.ctx.createGain();
    g.gain.value = value;
    this.nodes.push(g);
    return g;
  }

  osc(type: OscillatorType, frequency: number, detune = 0): OscillatorNode {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.value = frequency;
    o.detune.value = detune;
    this.sources.push(o);
    this.nodes.push(o);
    return o;
  }

  noise(): AudioBufferSourceNode {
    const s = this.ctx.createBufferSource();
    s.buffer = noiseBuffer(this.ctx);
    s.loop = true;
    this.sources.push(s);
    this.nodes.push(s);
    return s;
  }

  filter(type: BiquadFilterType, frequency: number, q = 0.7): BiquadFilterNode {
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = frequency;
    f.Q.value = q;
    this.nodes.push(f);
    return f;
  }

  /** Connects a → b → c …; the last link may be an AudioParam (modulation target). */
  chain(...nodes: [...AudioNode[], AudioNode | AudioParam]): void {
    for (let i = 0; i < nodes.length - 1; i++) {
      const from = nodes[i] as AudioNode;
      const to = nodes[i + 1]!;
      if (to instanceof AudioNode) from.connect(to);
      else from.connect(to);
    }
  }

  start(at: number): void {
    for (const s of this.sources) s.start(at);
  }

  /** Stops every source at `at` and disconnects the whole graph once the last one ends. */
  stop(at: number): void {
    let pending = this.sources.length;
    const teardown = () => {
      if (--pending > 0) return;
      for (const n of this.nodes) {
        try {
          n.disconnect();
        } catch {
          /* already disconnected */
        }
      }
    };
    for (const s of this.sources) {
      s.onended = teardown;
      s.stop(at);
    }
    if (pending === 0) teardown();
  }
}

/** Attack → peak, then an exponential release to silence. */
function pluck(p: AudioParam, t: number, peak: number, attack: number, release: number): void {
  p.setValueAtTime(FLOOR, t);
  p.linearRampToValueAtTime(peak, t + attack);
  p.exponentialRampToValueAtTime(FLOOR, t + attack + release);
}

/** Attack → hold → exponential release. */
function swell(p: AudioParam, t: number, peak: number, attack: number, hold: number, release: number): void {
  p.setValueAtTime(FLOOR, t);
  p.linearRampToValueAtTime(peak, t + attack);
  p.setValueAtTime(peak, t + attack + hold);
  p.exponentialRampToValueAtTime(FLOOR, t + attack + hold + release);
}

function glide(p: AudioParam, t: number, from: number, to: number, duration: number): void {
  p.setValueAtTime(from, t);
  p.exponentialRampToValueAtTime(to, t + duration);
}

// ---------------------------------------------------------------------------
// Cues (one-shot)
// ---------------------------------------------------------------------------

/** Peak amplitudes at the output stage input (before the ceiling). */
const LEVEL = {
  select: 0.075,
  hover: 0.02,
  cockpitOn: 0.065,
  cockpitOff: 0.055,
  ignitionNoise: 0.075,
  ignitionSub: 0.05,
  launchNoise: 0.09,
  launchSub: 0.035,
  terminal: 0.06,
} as const;

/** Cue durations in seconds (for documentation and the offline level check). */
export const CUE_SECONDS: Record<CueName, number> = {
  select: 0.16,
  hover: 0.06,
  cockpitOn: 1.0,
  cockpitOff: 1.0,
  ignition: 3.8,
  launch: 2.6,
  terminal: 0.24,
};

/** Schedules `cue` into `out` starting at context time `t`. Returns when it ends. */
export function playCueInto(ctx: BaseAudioContext, out: AudioNode, cue: CueName, t: number): number {
  const v = new Voice(ctx);
  switch (cue) {
    case 'select': {
      // Soft triangle tick with a small downward bend.
      const o = v.osc('triangle', 880);
      glide(o.frequency, t, 880, 640, 0.08);
      const lp = v.filter('lowpass', 2400, 0.7);
      const g = v.gain(0);
      pluck(g.gain, t, LEVEL.select, 0.004, 0.11);
      v.chain(o, lp, g, out);
      v.start(t);
      v.stop(t + CUE_SECONDS.select);
      break;
    }
    case 'hover': {
      const o = v.osc('sine', 1500);
      const g = v.gain(0);
      pluck(g.gain, t, LEVEL.hover, 0.002, 0.03);
      v.chain(o, g, out);
      v.start(t);
      v.stop(t + CUE_SECONDS.hover);
      break;
    }
    case 'cockpitOn': {
      // Rising resonant sweep (power coming up) with a small blip as the screens light.
      const o = v.osc('sawtooth', 70);
      glide(o.frequency, t, 70, 180, 0.9);
      const lp = v.filter('lowpass', 160, 2.2);
      glide(lp.frequency, t, 160, 1600, 0.9);
      const g = v.gain(0);
      swell(g.gain, t, LEVEL.cockpitOn, 0.25, 0.4, 0.3);
      v.chain(o, lp, g, out);
      const blip = v.osc('triangle', 1320);
      const bg = v.gain(0);
      pluck(bg.gain, t + 0.78, LEVEL.cockpitOn * 0.5, 0.004, 0.09);
      v.chain(blip, bg, out);
      v.start(t);
      v.stop(t + CUE_SECONDS.cockpitOn);
      break;
    }
    case 'cockpitOff': {
      const blip = v.osc('triangle', 990);
      const bg = v.gain(0);
      pluck(bg.gain, t, LEVEL.cockpitOff * 0.5, 0.004, 0.09);
      v.chain(blip, bg, out);
      const o = v.osc('sawtooth', 180);
      glide(o.frequency, t + 0.08, 180, 60, 0.85);
      const lp = v.filter('lowpass', 1600, 2.0);
      glide(lp.frequency, t + 0.08, 1600, 140, 0.85);
      const g = v.gain(0);
      swell(g.gain, t + 0.08, LEVEL.cockpitOff, 0.08, 0.35, 0.45);
      v.chain(o, lp, g, out);
      v.start(t);
      v.stop(t + CUE_SECONDS.cockpitOff);
      break;
    }
    case 'ignition': {
      // Low rumble: filtered noise opening up over 1.2s plus a sub sine, held, then eased out.
      const n = v.noise();
      const lp = v.filter('lowpass', 90, 1.0);
      glide(lp.frequency, t, 90, 380, 1.2);
      const ng = v.gain(0);
      swell(ng.gain, t, LEVEL.ignitionNoise, 1.2, 1.4, 1.2);
      v.chain(n, lp, ng, out);
      const sub = v.osc('sine', 34);
      glide(sub.frequency, t, 34, 52, 1.2);
      const sg = v.gain(0);
      swell(sg.gain, t, LEVEL.ignitionSub, 1.2, 1.2, 1.0);
      v.chain(sub, sg, out);
      v.start(t);
      v.stop(t + CUE_SECONDS.ignition);
      break;
    }
    case 'launch': {
      // Whoosh: band-passed noise rising through the spectrum, with a rising sub underneath.
      const n = v.noise();
      const bp = v.filter('bandpass', 180, 1.0);
      glide(bp.frequency, t, 180, 2600, 2.5);
      const ng = v.gain(0);
      swell(ng.gain, t, LEVEL.launchNoise, 0.7, 0.8, 1.0);
      v.chain(n, bp, ng, out);
      const sub = v.osc('sine', 45);
      glide(sub.frequency, t, 45, 110, 2.5);
      const sg = v.gain(0);
      swell(sg.gain, t, LEVEL.launchSub, 0.5, 0.6, 0.9);
      v.chain(sub, sg, out);
      v.start(t);
      v.stop(t + CUE_SECONDS.launch);
      break;
    }
    case 'terminal': {
      // Two-note blip, low then high.
      const lp = v.filter('lowpass', 3000, 0.7);
      lp.connect(out);
      const a = v.osc('sine', 660);
      const ag = v.gain(0);
      pluck(ag.gain, t, LEVEL.terminal, 0.003, 0.09);
      v.chain(a, ag, lp);
      const b = v.osc('sine', 990);
      const bg = v.gain(0);
      pluck(bg.gain, t + 0.1, LEVEL.terminal, 0.003, 0.1);
      v.chain(b, bg, lp);
      v.start(t);
      v.stop(t + CUE_SECONDS.terminal);
      break;
    }
  }
  return t + CUE_SECONDS[cue];
}

// ---------------------------------------------------------------------------
// Ambience beds (looping, crossfaded by the owner through `out.gain`)
// ---------------------------------------------------------------------------

export interface Bed {
  family: AmbienceFamily;
  /** Crossfade envelope 0..1; internal levels are baked into the bed. */
  out: GainNode;
  stop(at: number): void;
}

const BED = {
  spaceWind: 0.08,
  spaceDrone: 0.014,
  cockpitHum: 0.015,
  cockpitFan: 0.02,
} as const;

/** Creates and starts a bed with `out.gain` at 0. Returns null for silence. */
export function createBed(ctx: BaseAudioContext, dest: AudioNode, family: AmbienceFamily, at: number): Bed | null {
  if (family === 'silence') return null;
  const v = new Voice(ctx);
  const out = v.gain(0);
  out.connect(dest);

  if (family === 'space') {
    // Wind: low-passed noise whose cutoff and level wander slowly.
    const wind = v.noise();
    const lp = v.filter('lowpass', 240, 0.8);
    const windGain = v.gain(BED.spaceWind);
    v.chain(wind, lp, windGain, out);
    const cutoffLfo = v.osc('sine', 0.06);
    v.chain(cutoffLfo, v.gain(110), lp.frequency);
    const levelLfo = v.osc('sine', 0.045);
    v.chain(levelLfo, v.gain(BED.spaceWind * 0.4), windGain.gain);
    // Drone: a low fifth, gently detuned, kept dark.
    const d1 = v.osc('sine', 55);
    const d2 = v.osc('triangle', 82.41, 5);
    const droneLp = v.filter('lowpass', 200, 0.5);
    const droneGain = v.gain(BED.spaceDrone);
    d1.connect(droneLp);
    v.chain(d2, v.gain(0.3), droneLp);
    v.chain(droneLp, droneGain, out);
    const droneLfo = v.osc('sine', 0.03);
    v.chain(droneLfo, v.gain(BED.spaceDrone * 0.35), droneGain.gain);
  } else {
    // Hum: 50 Hz with a slow beat and two soft harmonics.
    const humLp = v.filter('lowpass', 260, 0.7);
    const humGain = v.gain(BED.cockpitHum);
    v.osc('sine', 50).connect(humLp);
    v.chain(v.osc('sine', 50.35), v.gain(0.35), humLp);
    v.chain(v.osc('sine', 100), v.gain(0.3), humLp);
    v.chain(v.osc('triangle', 150), v.gain(0.12), humLp);
    v.chain(humLp, humGain, out);
    // Fan: a narrow band of noise with a slow airflow wobble.
    const fan = v.noise();
    const bp = v.filter('bandpass', 1000, 1.2);
    const fanGain = v.gain(BED.cockpitFan);
    v.chain(fan, bp, fanGain, out);
    const fanLfo = v.osc('sine', 0.5);
    v.chain(fanLfo, v.gain(BED.cockpitFan * 0.3), fanGain.gain);
  }

  v.start(at);
  return { family, out, stop: (t) => v.stop(t) };
}

// ---------------------------------------------------------------------------
// Offline level check (dev/debug only)
// ---------------------------------------------------------------------------

export interface LevelReport {
  kind: CueName | AmbienceFamily;
  seconds: number;
  peak: number;
  peakDb: number;
  rmsDb: number;
}

/** Renders a cue or a bed through the output stage offline and reports its peak and RMS. */
export async function measureOffline(kind: CueName | AmbienceFamily, seconds?: number): Promise<LevelReport> {
  const w = globalThis as { OfflineAudioContext?: typeof OfflineAudioContext; webkitOfflineAudioContext?: typeof OfflineAudioContext };
  const Ctor = w.OfflineAudioContext ?? w.webkitOfflineAudioContext;
  if (!Ctor) throw new Error('OfflineAudioContext unavailable');
  const isCue = (CUE_NAMES as readonly string[]).includes(kind);
  const length = seconds ?? (isCue ? CUE_SECONDS[kind as CueName] + 0.3 : 4);
  const rate = 48000;
  const ctx = new Ctor(1, Math.ceil(length * rate), rate);
  const stage = createOutputStage(ctx, ctx.destination, 1);
  let skip = 0;
  if (isCue) {
    playCueInto(ctx, stage.input, kind as CueName, 0.02);
  } else {
    const bed = createBed(ctx, stage.input, kind as AmbienceFamily, 0);
    if (bed) bed.out.gain.value = 1;
    skip = Math.floor(rate * 0.5); // let filters settle
  }
  const rendered = await ctx.startRendering();
  const data = rendered.getChannelData(0);
  let peak = 0;
  let sum = 0;
  for (let i = skip; i < data.length; i++) {
    const s = Math.abs(data[i]!);
    if (s > peak) peak = s;
    sum += s * s;
  }
  const rms = Math.sqrt(sum / Math.max(1, data.length - skip));
  return { kind, seconds: length, peak, peakDb: gainToDb(peak), rmsDb: gainToDb(rms) };
}
