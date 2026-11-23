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

/** Fixed DelayNode max on construction — avoids mid-play recreate when time grows. */
export const DELAY_MAX_CAP_SEC = 2;
export const DELAY_PARAM_EPSILON = 1e-4;
const PATH_GAIN_EPSILON = 1e-4;
const PATH_PAN_EPSILON = 1e-4;

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
/** Android: hard cap IR length (cathedral default was 2.5×2.5=6.25s; 2.5s still crackled). */
const ANDROID_REVERB_IR_MAX_SEC = 1.2;
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
  // Feedback is applied in place — omit from key to avoid scrub rekeys.
  const { preset, sync, timeMs } = effects.delay;
  return `${preset}:${sync}:${timeMs}`;
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

/** DelayNode construction size — always the cap so mid-play time changes never recreate. */
export function requiredDelayMaxSec(_effects?: LayerEffects): number {
  return DELAY_MAX_CAP_SEC;
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

export type SyncReverbConvolverOptions = {
  /**
   * Android: when swapping IR while wet is already audible, mute this send
   * before assign. Caller (or pending timeout) restores mix afterward.
   */
  duckSend?: GainNode;
  /** Mix to restore after a throttled/pending ducked assign. */
  restoreMix?: number;
  restoreRampSec?: number;
};

function duckSendIfAudible(
  duckSend: GainNode | undefined,
  context: AudioContext
): boolean {
  if (!duckSend || Platform.OS !== 'android') {
    return false;
  }
  const current = typeof duckSend.gain.value === 'number' ? duckSend.gain.value : 0;
  if (current <= 0.001) {
    return false;
  }
  setAudioParamValue(duckSend.gain, 0, context.currentTime);
  return true;
}

export function syncReverbConvolver(
  nodes: LayerReverbNodes,
  effects: LayerEffects,
  context: AudioContext,
  options?: SyncReverbConvolverOptions
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
  const duckSend = options?.duckSend;
  const restoreMix = options?.restoreMix;
  const restoreRampSec = options?.restoreRampSec ?? 0.008;

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
        const ducked = duckSendIfAudible(duckSend, context);
        assignReverbImpulse(convolver, preset, decay, context);
        if (
          ducked &&
          duckSend &&
          typeof restoreMix === 'number' &&
          restoreMix > 0
        ) {
          setAudioParamValue(duckSend.gain, restoreMix, context.currentTime, {
            rampSec: restoreRampSec,
          });
        }
      }, REVERB_IR_THROTTLE_MS - (nowMs - lastSyncAt))
    );
    return;
  }

  const pending = pendingReverbIrSync.get(convolver);
  if (pending) {
    clearTimeout(pending);
    pendingReverbIrSync.delete(convolver);
  }
  duckSendIfAudible(duckSend, context);
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
  const nextGain = isLayerAudible(effects, anySoloActive)
    ? dbToLinear(effects.volumeDb)
    : 0;
  const currentGain =
    typeof path.gain.gain.value === 'number' ? path.gain.gain.value : nextGain;
  if (Math.abs(currentGain - nextGain) > PATH_GAIN_EPSILON) {
    setAudioParamValue(path.gain.gain, nextGain, now);
  }

  const nextPan = clampPan(effects.pan);
  const currentPan =
    typeof path.panner.pan.value === 'number' ? path.panner.pan.value : nextPan;
  if (Math.abs(currentPan - nextPan) > PATH_PAN_EPSILON) {
    setAudioParamValue(path.panner.pan, nextPan, now);
  }

  effects.eq.bands.forEach((bandDb, index) => {
    const filter = path.eqFilters[index];
    const type = effects.eq.types[index] ?? 'peaking';
    if (filter.type !== type) {
      filter.type = type;
    }
    const currentBand =
      typeof filter.gain.value === 'number' ? filter.gain.value : bandDb;
    if (Math.abs(currentBand - bandDb) > PATH_GAIN_EPSILON) {
      setAudioParamValue(filter.gain, bandDb, now);
    }
    const nextFreq = effects.eq.frequencies[index];
    const currentFreq =
      typeof filter.frequency.value === 'number'
        ? filter.frequency.value
        : nextFreq;
    if (Math.abs(currentFreq - nextFreq) > 0.5) {
      setAudioParamValue(filter.frequency, nextFreq, now);
    }
    const nextQ = effects.eq.qFactors[index];
    const currentQ =
      typeof filter.Q.value === 'number' ? filter.Q.value : nextQ;
    if (Math.abs(currentQ - nextQ) > PATH_GAIN_EPSILON) {
      setAudioParamValue(filter.Q, nextQ, now);
    }
  });
}

export function clearReverbIrCache(): void {
  reverbIrCache.clear();
}
