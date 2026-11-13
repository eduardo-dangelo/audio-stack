import type {
  AudioBuffer,
  AudioContext,
  BiquadFilterNode,
  ConvolverNode,
  GainNode,
  StereoPannerNode,
} from 'react-native-audio-api';
import { Platform } from 'react-native';

import {
  clampPan,
  dbToLinear,
  EQ_FREQUENCIES,
  isLayerAudible,
  syncDelayTimeMs,
  type LayerEffects,
  type ReverbPreset,
} from '@/src/audio/layerEffects';

export type LayerEffectPathNodes = {
  gain: GainNode;
  /** Dedicated fade automation node (after volume gain). */
  fadeGain: GainNode;
  eqFilters: BiquadFilterNode[];
  /** Stereo balance after EQ; dry/wet paths each get their own node. */
  panner: StereoPannerNode;
};

export type LayerReverbNodes = {
  reverbConvolver: ConvolverNode;
  reverbWet: GainNode;
};

const DELAY_MAX_CAP_SEC = 2;
const DELAY_HEADROOM_SEC = 0.05;
const DELAY_MIN_MAX_SEC = 0.05;

const REVERB_DURATION: Record<Exclude<ReverbPreset, 'off' | 'custom'>, number> = {
  room: 0.6,
  hall: 1.8,
  plate: 1.2,
  chamber: 0.9,
  cathedral: 2.5,
  spring: 1.2,
};

/** iOS keeps 80ms; Android commits decay IR after ~300ms idle to cut FFT/thread churn. */
const REVERB_IR_THROTTLE_MS = Platform.OS === 'android' ? 300 : 80;
/** Android: hard cap IR length (cathedral default was 2.5×2.5=6.25s). */
const ANDROID_REVERB_IR_MAX_SEC = 2.5;
/** Cap IR buffers so scrubbing decay cannot grow RAM unboundedly. */
const REVERB_IR_CACHE_MAX = 16;

const reverbIrCache = new Map<string, AudioBuffer>();
const lastReverbIrKey = new WeakMap<ConvolverNode, string>();
const lastReverbIrSyncAt = new WeakMap<ConvolverNode, number>();
const lastReverbPreset = new WeakMap<ConvolverNode, ReverbPreset>();
const pendingReverbIrSync = new WeakMap<ConvolverNode, ReturnType<typeof setTimeout>>();

export function isDelayPathActive(effects: LayerEffects): boolean {
  return effects.delay.preset !== 'off' && effects.delay.mix > 0;
}

export function isReverbPathActive(effects: LayerEffects): boolean {
  return effects.reverb.preset !== 'off' && effects.reverb.mix > 0;
}

/**
 * Whether the wet bus should exist. Android keeps the bus while the preset is
 * on so mix 0↔>0 is send-gain-only (no IR rebuild / path teardown).
 */
export function isDelayPathPresent(effects: LayerEffects): boolean {
  if (Platform.OS === 'android') {
    return effects.delay.preset !== 'off';
  }
  return isDelayPathActive(effects);
}

export function isReverbPathPresent(effects: LayerEffects): boolean {
  if (Platform.OS === 'android') {
    return effects.reverb.preset !== 'off';
  }
  return isReverbPathActive(effects);
}

export function delayBusKey(effects: LayerEffects): string {
  const { preset, sync, timeMs, feedback } = effects.delay;
  return `${preset}:${sync}:${timeMs}:${feedback}`;
}

/** Android quantizes decay to 0.1 so slider drags regenerate fewer IRs. */
function quantizeReverbDecay(decay: number): number {
  if (Platform.OS !== 'android') {
    return decay;
  }
  return Math.round(Math.max(0, decay) * 10) / 10;
}

export function reverbBusKey(effects: LayerEffects): string {
  return `${effects.reverb.preset}:${quantizeReverbDecay(effects.reverb.decay).toFixed(2)}`;
}

export function getEffectiveReverbMix(effects: LayerEffects): number {
  if (effects.reverb.preset === 'off') {
    return 0;
  }
  return Math.min(1, Math.max(0, effects.reverb.mix / 100));
}

export function getDelayTimeSec(effects: LayerEffects): number {
  return effects.delay.sync === 'off'
    ? effects.delay.timeMs / 1000
    : syncDelayTimeMs(effects.delay.sync) / 1000;
}

/** Max delay buffer size for createDelay (fixed at construction). */
export function requiredDelayMaxSec(effects: LayerEffects): number {
  return Math.min(
    DELAY_MAX_CAP_SEC,
    Math.max(DELAY_MIN_MAX_SEC, getDelayTimeSec(effects) + DELAY_HEADROOM_SEC)
  );
}

function createImpulseResponse(
  context: AudioContext,
  durationSec: number,
  decay: number
): AudioBuffer {
  const sampleRate = context.sampleRate;
  const length = Math.max(1, Math.floor(sampleRate * durationSec));
  const impulse = context.createBuffer(1, length, sampleRate);
  const data = impulse.getChannelData(0);

  for (let i = 0; i < length; i += 1) {
    const envelope = Math.pow(1 - i / length, Math.max(0.5, decay));
    data[i] = (Math.random() * 2 - 1) * envelope;
  }

  return impulse;
}

export function reverbIrKey(preset: ReverbPreset, decay: number): string {
  return `${preset}:${quantizeReverbDecay(decay).toFixed(2)}`;
}

function getReverbDurationSec(preset: ReverbPreset, decay: number): number {
  const qDecay = Math.max(0.3, quantizeReverbDecay(decay));
  let durationSec =
    preset === 'custom' || preset === 'off'
      ? qDecay
      : REVERB_DURATION[preset] * qDecay;
  if (Platform.OS === 'android') {
    durationSec = Math.min(ANDROID_REVERB_IR_MAX_SEC, durationSec);
  }
  return durationSec;
}

export function getOrCreateImpulseResponse(
  context: AudioContext,
  preset: Exclude<ReverbPreset, 'off'>,
  decay: number
): AudioBuffer {
  const key = reverbIrKey(preset, decay);
  const cached = reverbIrCache.get(key);
  if (cached) {
    // Refresh LRU order.
    reverbIrCache.delete(key);
    reverbIrCache.set(key, cached);
    return cached;
  }
  const impulse = createImpulseResponse(
    context,
    getReverbDurationSec(preset, decay),
    decay
  );
  reverbIrCache.set(key, impulse);
  while (reverbIrCache.size > REVERB_IR_CACHE_MAX) {
    const oldest = reverbIrCache.keys().next().value;
    if (oldest === undefined) {
      break;
    }
    reverbIrCache.delete(oldest);
  }
  return impulse;
}

export function buildInputEqPath(context: AudioContext): LayerEffectPathNodes {
  const gain = context.createGain();
  const fadeGain = context.createGain();
  fadeGain.gain.value = 1;
  const eqFilters = EQ_FREQUENCIES.map((frequency) => {
    const filter = context.createBiquadFilter();
    filter.type = 'peaking';
    filter.frequency.value = frequency;
    filter.Q.value = 1;
    return filter;
  });
  const panner = context.createStereoPanner();
  panner.pan.value = 0;

  gain.connect(fadeGain);
  fadeGain.connect(eqFilters[0]);
  for (let i = 0; i < eqFilters.length - 1; i += 1) {
    eqFilters[i].connect(eqFilters[i + 1]);
  }
  eqFilters[eqFilters.length - 1].connect(panner);

  return { gain, fadeGain, eqFilters, panner };
}

function assignReverbImpulse(
  convolver: ConvolverNode,
  preset: Exclude<ReverbPreset, 'off'>,
  decay: number,
  context: AudioContext
): void {
  const key = reverbIrKey(preset, decay);
  const impulse = getOrCreateImpulseResponse(context, preset, decay);
  convolver.buffer = impulse;
  lastReverbIrKey.set(convolver, key);
  lastReverbPreset.set(convolver, preset);
  lastReverbIrSyncAt.set(convolver, Date.now());
}

export function syncReverbConvolver(
  nodes: LayerReverbNodes,
  effects: LayerEffects,
  context: AudioContext
): void {
  const { preset, decay } = effects.reverb;
  if (preset === 'off') {
    return;
  }

  const convolver = nodes.reverbConvolver;
  const key = reverbIrKey(preset, decay);
  const previousKey = lastReverbIrKey.get(convolver);
  const previousPreset = lastReverbPreset.get(convolver);
  const presetChanged = previousPreset !== preset;

  if (previousKey === key) {
    const pending = pendingReverbIrSync.get(convolver);
    if (pending) {
      clearTimeout(pending);
      pendingReverbIrSync.delete(convolver);
    }
    return;
  }

  const nowMs = Date.now();
  const lastSyncAt = lastReverbIrSyncAt.get(convolver) ?? 0;
  if (!presetChanged && nowMs - lastSyncAt < REVERB_IR_THROTTLE_MS) {
    const existing = pendingReverbIrSync.get(convolver);
    if (existing) {
      clearTimeout(existing);
    }
    pendingReverbIrSync.set(
      convolver,
      setTimeout(() => {
        pendingReverbIrSync.delete(convolver);
        assignReverbImpulse(convolver, preset, decay, context);
      }, REVERB_IR_THROTTLE_MS - (nowMs - lastSyncAt))
    );
    return;
  }

  const pending = pendingReverbIrSync.get(convolver);
  if (pending) {
    clearTimeout(pending);
    pendingReverbIrSync.delete(convolver);
  }
  assignReverbImpulse(convolver, preset, decay, context);
}

/** Replace live param without filling the 64-event automation queue. */
export function setAudioParamValue(
  param: {
    cancelScheduledValues: (time: number) => void;
    setValueAtTime: (value: number, time: number) => void;
    linearRampToValueAtTime?: (value: number, endTime: number) => void;
    value?: number;
  },
  value: number,
  time: number,
  options?: { rampSec?: number }
): void {
  const rampSec = options?.rampSec ?? 0;
  param.cancelScheduledValues(time);
  if (
    rampSec > 0 &&
    typeof param.linearRampToValueAtTime === 'function' &&
    typeof param.value === 'number'
  ) {
    param.setValueAtTime(param.value, time);
    param.linearRampToValueAtTime(value, time + rampSec);
    return;
  }
  param.setValueAtTime(value, time);
}

/** Drop a pending throttled IR assign so released convolvers cannot be revived. */
export function clearPendingReverbIrSync(convolver: ConvolverNode): void {
  const pending = pendingReverbIrSync.get(convolver);
  if (pending) {
    clearTimeout(pending);
    pendingReverbIrSync.delete(convolver);
  }
}

export function applyPathInputEffects(
  path: LayerEffectPathNodes,
  effects: LayerEffects,
  context: AudioContext,
  anySoloActive: boolean
): void {
  const now = context.currentTime;
  setAudioParamValue(
    path.gain.gain,
    isLayerAudible(effects, anySoloActive) ? dbToLinear(effects.volumeDb) : 0,
    now
  );
  setAudioParamValue(path.panner.pan, clampPan(effects.pan), now);
  effects.eq.bands.forEach((bandDb, index) => {
    const filter = path.eqFilters[index];
    const type = effects.eq.types[index] ?? 'peaking';
    if (filter.type !== type) {
      filter.type = type;
    }
    setAudioParamValue(filter.gain, bandDb, now);
    setAudioParamValue(filter.frequency, effects.eq.frequencies[index], now);
    setAudioParamValue(filter.Q, effects.eq.qFactors[index], now);
  });
}

export function clearReverbIrCache(): void {
  reverbIrCache.clear();
}
