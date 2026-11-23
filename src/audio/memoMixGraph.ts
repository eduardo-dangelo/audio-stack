import type {
  AudioContext,
  AudioNode,
  ConvolverNode,
  DelayNode,
  GainNode,
} from 'react-native-audio-api';
import { Platform } from 'react-native';

import {
  applyPathInputEffects,
  buildInputEqPath,
  clearPendingReverbIrSync,
  DELAY_MAX_CAP_SEC,
  DELAY_PARAM_EPSILON,
  delayBusKey,
  getDelayTimeSec,
  getEffectiveReverbMix,
  isDelayPathActive,
  isDelayPathPresent,
  isReverbPathActive,
  isReverbPathPresent,
  reverbBusKey,
  setAudioParamValue,
  syncReverbConvolver,
  type LayerEffectPathNodes,
  type LayerReverbNodes,
} from '@/src/audio/layerEffectChain';
import {
  REVERB_PRESET_DEFAULTS,
  type LayerEffects,
} from '@/src/audio/layerEffects';

/** Android: short wet-send ramp once the wet BufferSource exists. */
export const ANDROID_WET_SEND_RAMP_SEC = 0.008;

type DelayBus = {
  key: string;
  input: GainNode;
  delayNode: DelayNode;
  delayFeedback: GainNode;
  wet: GainNode;
  maxDelayTime: number;
  refCount: number;
};

type ReverbBus = {
  key: string;
  input: GainNode;
  convolver: ConvolverNode;
  wet: GainNode;
  refCount: number;
};

export type LayerWetPath = LayerEffectPathNodes & {
  send: GainNode;
};

export type LayerChannel = {
  layerId: string;
  dry: LayerEffectPathNodes & { dryGain: GainNode };
  delay: LayerWetPath | null;
  reverb: LayerWetPath | null;
  delayBusKey: string | null;
  reverbBusKey: string | null;
};

export type ApplyLayerEffectsOptions = {
  /** Keep wet sends at 0; caller ramps after arming wet sources. */
  deferWetSend?: boolean;
  /** Skip dry-path EQ/gain/pan rewrite (wet-presence-only updates). */
  skipDryPathInputs?: boolean;
  /** Context time for wet send automation (default: now). */
  wetSendAtTime?: number;
  wetSendRampSec?: number;
};

function disconnectNode(node: AudioNode): void {
  try {
    node.disconnect();
  } catch {
    // Already disconnected.
  }
}

function applyDelayBusParams(
  bus: DelayBus,
  effects: LayerEffects,
  context: AudioContext
): void {
  const now = context.currentTime;
  const delayTimeSec = Math.min(
    bus.maxDelayTime,
    Math.max(0, getDelayTimeSec(effects))
  );
  const nextFeedback = Math.min(
    0.85,
    Math.max(0, effects.delay.feedback / 100)
  );
  const rampSec = Platform.OS === 'android' ? ANDROID_WET_SEND_RAMP_SEC : 0;

  const currentDelay =
    typeof bus.delayNode.delayTime.value === 'number'
      ? bus.delayNode.delayTime.value
      : delayTimeSec;
  if (Math.abs(currentDelay - delayTimeSec) > DELAY_PARAM_EPSILON) {
    setAudioParamValue(bus.delayNode.delayTime, delayTimeSec, now, { rampSec });
  }

  const currentFeedback =
    typeof bus.delayFeedback.gain.value === 'number'
      ? bus.delayFeedback.gain.value
      : nextFeedback;
  if (Math.abs(currentFeedback - nextFeedback) > DELAY_PARAM_EPSILON) {
    setAudioParamValue(bus.delayFeedback.gain, nextFeedback, now, { rampSec });
  }

  const currentWet =
    typeof bus.wet.gain.value === 'number' ? bus.wet.gain.value : 1;
  if (Math.abs(currentWet - 1) > DELAY_PARAM_EPSILON) {
    setAudioParamValue(bus.wet.gain, 1, now);
  }
}

export class MemoMixGraph {
  private boundContext: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private layerChannels = new Map<string, LayerChannel>();
  private delayBuses = new Map<string, DelayBus>();
  private reverbBuses = new Map<string, ReverbBus>();

  /** Drop graph nodes if they belong to a different AudioContext. */
  private bindContext(context: AudioContext): void {
    if (this.boundContext && this.boundContext !== context) {
      this.dispose();
    }
    this.boundContext = context;
  }

  getMasterGain(context: AudioContext): GainNode {
    this.bindContext(context);
    if (!this.masterGain) {
      this.masterGain = context.createGain();
      this.masterGain.gain.value = 1;
      this.masterGain.connect(context.destination);
    }
    return this.masterGain;
  }

  getChannel(layerId: string): LayerChannel | undefined {
    return this.layerChannels.get(layerId);
  }

  removeLayer(layerId: string): void {
    const channel = this.layerChannels.get(layerId);
    if (!channel) {
      return;
    }

    this.releaseChannelDelay(channel);
    this.releaseChannelReverb(channel);
    this.teardownWetPath(channel.delay);
    this.teardownWetPath(channel.reverb);

    try {
      channel.dry.gain.disconnect();
      channel.dry.fadeGain.disconnect();
      channel.dry.panner.disconnect();
      channel.dry.dryGain.disconnect();
    } catch {
      // Nodes may already be torn down.
    }

    this.layerChannels.delete(layerId);
  }

  /** Ensure channels exist and effects are applied for the given layers. */
  syncLayers(context: AudioContext, layers: { id: string; effects: LayerEffects }[]): void {
    this.bindContext(context);
    this.getMasterGain(context);
    const nextIds = new Set(layers.map((layer) => layer.id));

    for (const layerId of this.layerChannels.keys()) {
      if (!nextIds.has(layerId)) {
        this.removeLayer(layerId);
      }
    }

    const anySoloActive = layers.some((layer) => Boolean(layer.effects.solo));

    for (const layer of layers) {
      this.ensureChannel(context, layer.id);
      this.applyLayerEffects(context, layer.id, layer.effects, anySoloActive);
    }
  }

  /**
   * Android: create wet EQ paths (+ delay/reverb buses when preset is on) with
   * send=0 so mid-play enable is mostly send+arm.
   */
  prebuildAndroidWetInfrastructure(
    context: AudioContext,
    layerId: string,
    effects: LayerEffects
  ): void {
    if (Platform.OS !== 'android') {
      return;
    }
    this.bindContext(context);
    const channel = this.ensureChannel(context, layerId);
    const now = context.currentTime;

    channel.delay = this.ensureWetPath(context, channel.delay);
    channel.reverb = this.ensureWetPath(context, channel.reverb);
    setAudioParamValue(channel.delay.send.gain, 0, now);
    setAudioParamValue(channel.reverb.send.gain, 0, now);

    // Standby delay bus at fixed max so first delay preset never recreates.
    if (!channel.delayBusKey) {
      const standbyEffects: LayerEffects = {
        ...effects,
        delay: {
          ...effects.delay,
          preset: effects.delay.preset === 'off' ? 'echo' : effects.delay.preset,
          mix: 0,
        },
      };
      const bus = this.acquireDelayBus(
        context,
        delayBusKey(standbyEffects),
        standbyEffects
      );
      this.connectDelaySend(channel, bus);
      channel.delayBusKey = bus.key;
    }

    if (isReverbPathPresent(effects)) {
      this.syncReverbBus(context, channel, effects);
      setAudioParamValue(channel.reverb.send.gain, 0, now);
    } else {
      this.ensureCathedralStandbyBus(context, channel, effects);
    }
  }

  /** Silent cathedral bus so mid-play cathedral pick skips convolver.buffer assign. */
  private ensureCathedralStandbyBus(
    context: AudioContext,
    channel: LayerChannel,
    effects: LayerEffects
  ): void {
    if (channel.reverbBusKey || !channel.reverb) {
      return;
    }
    const decay = REVERB_PRESET_DEFAULTS.cathedral.decay;
    const standbyEffects: LayerEffects = {
      ...effects,
      reverb: { preset: 'cathedral', mix: 0, decay },
    };
    const bus = this.acquireReverbBus(
      context,
      this.cathedralStandbyBusKey(effects),
      standbyEffects
    );
    this.connectReverbSend(channel, bus);
    channel.reverbBusKey = bus.key;
    setAudioParamValue(channel.reverb.send.gain, 0, context.currentTime);
  }

  setWetSendGain(
    layerId: string,
    kind: 'delay' | 'reverb',
    value: number,
    atTime: number,
    rampSec = 0
  ): void {
    const channel = this.layerChannels.get(layerId);
    const path = kind === 'delay' ? channel?.delay : channel?.reverb;
    if (!path) {
      return;
    }
    setAudioParamValue(path.send.gain, value, atTime, { rampSec });
  }

  private ensureChannel(context: AudioContext, layerId: string): LayerChannel {
    const existing = this.layerChannels.get(layerId);
    if (existing) {
      return existing;
    }

    const master = this.getMasterGain(context);
    const input = buildInputEqPath(context);
    const dryGain = context.createGain();
    input.panner.connect(dryGain);
    dryGain.connect(master);
    dryGain.gain.value = 1;

    const channel: LayerChannel = {
      layerId,
      dry: { ...input, dryGain },
      delay: null,
      reverb: null,
      delayBusKey: null,
      reverbBusKey: null,
    };

    this.layerChannels.set(layerId, channel);
    return channel;
  }

  private ensureWetPath(context: AudioContext, existing: LayerWetPath | null): LayerWetPath {
    if (existing) {
      return existing;
    }

    const input = buildInputEqPath(context);
    const send = context.createGain();
    input.panner.connect(send);
    send.gain.value = 0;
    return { ...input, send };
  }

  private teardownWetPath(path: LayerWetPath | null): void {
    if (!path) {
      return;
    }
    try {
      path.gain.disconnect();
      path.fadeGain.disconnect();
      for (const filter of path.eqFilters) {
        filter.disconnect();
      }
      path.panner.disconnect();
      path.send.disconnect();
    } catch {
      // Already torn down.
    }
  }

  private releaseChannelDelay(channel: LayerChannel): void {
    if (channel.delay) {
      disconnectNode(channel.delay.send);
    }
    if (channel.delayBusKey) {
      this.releaseDelayBus(channel.delayBusKey);
      channel.delayBusKey = null;
    }
  }

  private releaseChannelReverb(channel: LayerChannel): void {
    if (channel.reverb) {
      disconnectNode(channel.reverb.send);
    }
    if (channel.reverbBusKey) {
      this.releaseReverbBus(channel.reverbBusKey);
      channel.reverbBusKey = null;
    }
  }

  private acquireDelayBus(
    context: AudioContext,
    key: string,
    effects: LayerEffects
  ): DelayBus {
    const existing = this.delayBuses.get(key);
    if (existing) {
      existing.refCount += 1;
      applyDelayBusParams(existing, effects, context);
      return existing;
    }

    const master = this.getMasterGain(context);
    const maxDelayTime = DELAY_MAX_CAP_SEC;
    const input = context.createGain();
    const delayNode = context.createDelay(maxDelayTime);
    const delayFeedback = context.createGain();
    const wet = context.createGain();

    input.connect(delayNode);
    delayNode.connect(wet);
    delayNode.connect(delayFeedback);
    delayFeedback.connect(delayNode);
    wet.connect(master);

    const bus: DelayBus = {
      key,
      input,
      delayNode,
      delayFeedback,
      wet,
      maxDelayTime,
      refCount: 1,
    };

    this.delayBuses.set(key, bus);
    applyDelayBusParams(bus, effects, context);
    return bus;
  }

  private releaseDelayBus(key: string): void {
    const bus = this.delayBuses.get(key);
    if (!bus) {
      return;
    }

    bus.refCount -= 1;
    if (bus.refCount > 0) {
      return;
    }

    try {
      bus.input.disconnect();
      bus.delayNode.disconnect();
      bus.delayFeedback.disconnect();
      bus.wet.disconnect();
    } catch {
      // Already torn down.
    }

    this.delayBuses.delete(key);
  }

  private rekeyDelayBus(bus: DelayBus, nextKey: string): void {
    if (bus.key === nextKey) {
      return;
    }
    this.delayBuses.delete(bus.key);
    bus.key = nextKey;
    this.delayBuses.set(nextKey, bus);
  }

  private createReverbBusNodes(
    context: AudioContext,
    key: string,
    effects: LayerEffects
  ): ReverbBus {
    const input = context.createGain();
    const convolver = context.createConvolver();
    const wet = context.createGain();

    const reverbNodes: LayerReverbNodes = { reverbConvolver: convolver, reverbWet: wet };
    // First create: send not connected yet — no duck needed.
    syncReverbConvolver(reverbNodes, effects, context);

    const master = this.getMasterGain(context);
    input.connect(convolver);
    convolver.connect(wet);
    wet.connect(master);
    setAudioParamValue(wet.gain, 1, context.currentTime);

    return { key, input, convolver, wet, refCount: 0 };
  }

  private acquireReverbBus(
    context: AudioContext,
    key: string,
    effects: LayerEffects
  ): ReverbBus {
    const existing = this.reverbBuses.get(key);
    if (existing) {
      existing.refCount += 1;
      return existing;
    }

    const bus = this.createReverbBusNodes(context, key, effects);
    bus.refCount = 1;
    this.reverbBuses.set(key, bus);
    return bus;
  }

  private rekeyReverbBus(bus: ReverbBus, nextKey: string): void {
    if (bus.key === nextKey) {
      return;
    }
    this.reverbBuses.delete(bus.key);
    bus.key = nextKey;
    this.reverbBuses.set(nextKey, bus);
  }

  private releaseReverbBus(key: string): void {
    const bus = this.reverbBuses.get(key);
    if (!bus) {
      return;
    }

    bus.refCount -= 1;
    if (bus.refCount > 0) {
      return;
    }

    clearPendingReverbIrSync(bus.convolver);
    try {
      bus.input.disconnect();
      bus.convolver.disconnect();
      bus.wet.disconnect();
    } catch {
      // Already torn down.
    }

    this.reverbBuses.delete(key);
  }

  private connectDelaySend(channel: LayerChannel, bus: DelayBus): void {
    if (!channel.delay) {
      return;
    }
    disconnectNode(channel.delay.send);
    channel.delay.send.connect(bus.input);
  }

  private connectReverbSend(channel: LayerChannel, bus: ReverbBus): void {
    if (!channel.reverb) {
      return;
    }
    disconnectNode(channel.reverb.send);
    channel.reverb.send.connect(bus.input);
  }

  /**
   * Attach or update delay bus for a channel.
   * Updates in place when this layer is the sole subscriber (avoids scrub thrash).
   * Moves to a new bus when diverging from a shared bus.
   */
  private syncDelayBus(
    context: AudioContext,
    channel: LayerChannel,
    effects: LayerEffects
  ): void {
    const nextKey = delayBusKey(effects);

    if (!channel.delayBusKey) {
      const bus = this.acquireDelayBus(context, nextKey, effects);
      this.connectDelaySend(channel, bus);
      channel.delayBusKey = nextKey;
      return;
    }

    const current = this.delayBuses.get(channel.delayBusKey);
    if (!current) {
      channel.delayBusKey = null;
      const bus = this.acquireDelayBus(context, nextKey, effects);
      this.connectDelaySend(channel, bus);
      channel.delayBusKey = nextKey;
      return;
    }

    if (channel.delayBusKey === nextKey) {
      applyDelayBusParams(current, effects, context);
      return;
    }

    // Sole subscriber: update params in place (fixed max — never recreate).
    if (current.refCount === 1) {
      applyDelayBusParams(current, effects, context);
      this.rekeyDelayBus(current, nextKey);
      channel.delayBusKey = nextKey;
      return;
    }

    // Shared bus: diverge this layer onto its own settings.
    disconnectNode(channel.delay!.send);
    this.releaseDelayBus(channel.delayBusKey);
    channel.delayBusKey = null;
    const bus = this.acquireDelayBus(context, nextKey, effects);
    this.connectDelaySend(channel, bus);
    channel.delayBusKey = nextKey;
  }

  private syncReverbBus(
    context: AudioContext,
    channel: LayerChannel,
    effects: LayerEffects
  ): void {
    const nextKey = reverbBusKey(effects);

    if (!channel.reverbBusKey) {
      const bus = this.acquireReverbBus(context, nextKey, effects);
      this.connectReverbSend(channel, bus);
      channel.reverbBusKey = nextKey;
      return;
    }

    if (channel.reverbBusKey === nextKey) {
      return;
    }

    const current = this.reverbBuses.get(channel.reverbBusKey);
    if (current && current.refCount === 1) {
      // Sole subscriber: update IR in place. Duck only if wet send already audible.
      const reverbNodes: LayerReverbNodes = {
        reverbConvolver: current.convolver,
        reverbWet: current.wet,
      };
      const restoreMix = isReverbPathActive(effects)
        ? getEffectiveReverbMix(effects)
        : 0;
      syncReverbConvolver(reverbNodes, effects, context, {
        duckSend: channel.reverb?.send,
        restoreMix,
        restoreRampSec: ANDROID_WET_SEND_RAMP_SEC,
      });
      this.rekeyReverbBus(current, nextKey);
      channel.reverbBusKey = nextKey;
      return;
    }

    disconnectNode(channel.reverb!.send);
    this.releaseReverbBus(channel.reverbBusKey);
    channel.reverbBusKey = null;
    const bus = this.acquireReverbBus(context, nextKey, effects);
    this.connectReverbSend(channel, bus);
    channel.reverbBusKey = nextKey;
  }

  applyLayerEffects(
    context: AudioContext,
    layerId: string,
    effects: LayerEffects,
    anySoloActive: boolean,
    options?: ApplyLayerEffectsOptions
  ): void {
    const channel = this.ensureChannel(context, layerId);
    const now = context.currentTime;
    // Android: bus stays while preset is on; mix is send-gain only.
    const delayPresent = isDelayPathPresent(effects);
    const reverbPresent = isReverbPathPresent(effects);
    const delayMix = isDelayPathActive(effects) ? effects.delay.mix / 100 : 0;
    const reverbMix = isReverbPathActive(effects)
      ? getEffectiveReverbMix(effects)
      : 0;

    if (!options?.skipDryPathInputs) {
      applyPathInputEffects(channel.dry, effects, context, anySoloActive);
    }
    // Send-style: dry stays full; wet is additive.
    setAudioParamValue(channel.dry.dryGain.gain, 1, now);

    const deferWetSend = Boolean(options?.deferWetSend);
    const sendAt = options?.wetSendAtTime ?? now;
    const sendRampSec =
      options?.wetSendRampSec ??
      (Platform.OS === 'android' ? ANDROID_WET_SEND_RAMP_SEC : 0);

    if (delayPresent) {
      channel.delay = this.ensureWetPath(context, channel.delay);
      applyPathInputEffects(channel.delay, effects, context, anySoloActive);
      this.syncDelayBus(context, channel, effects);
      setAudioParamValue(
        channel.delay.send.gain,
        deferWetSend ? 0 : delayMix,
        deferWetSend ? now : sendAt,
        deferWetSend ? undefined : { rampSec: sendRampSec }
      );
    } else {
      this.releaseChannelDelay(channel);
      if (channel.delay) {
        setAudioParamValue(channel.delay.send.gain, 0, now);
        // Android: keep wet EQ path for fast mid-play re-enable.
        if (Platform.OS !== 'android') {
          this.teardownWetPath(channel.delay);
          channel.delay = null;
        }
      }
    }

    if (reverbPresent) {
      channel.reverb = this.ensureWetPath(context, channel.reverb);
      applyPathInputEffects(channel.reverb, effects, context, anySoloActive);
      this.syncReverbBus(context, channel, effects);
      setAudioParamValue(
        channel.reverb.send.gain,
        deferWetSend ? 0 : reverbMix,
        deferWetSend ? now : sendAt,
        deferWetSend ? undefined : { rampSec: sendRampSec }
      );
    } else if (Platform.OS === 'android' && channel.reverb) {
      // Keep silent cathedral standby across preset-off applies (avoid recreate thrash).
      const standbyKey = this.cathedralStandbyBusKey(effects);
      setAudioParamValue(channel.reverb.send.gain, 0, now);
      if (channel.reverbBusKey === standbyKey) {
        // Already on standby — leave bus in place.
      } else {
        this.releaseChannelReverb(channel);
        this.ensureCathedralStandbyBus(context, channel, effects);
      }
    } else {
      this.releaseChannelReverb(channel);
      if (channel.reverb) {
        this.teardownWetPath(channel.reverb);
        channel.reverb = null;
      }
    }
  }

  private cathedralStandbyBusKey(effects: LayerEffects): string {
    const decay = REVERB_PRESET_DEFAULTS.cathedral.decay;
    return reverbBusKey({
      ...effects,
      reverb: { preset: 'cathedral', mix: 0, decay },
    });
  }

  connectSourceToPath(source: AudioNode, path: LayerEffectPathNodes): void {
    source.connect(path.gain);
  }

  dispose(): void {
    for (const layerId of [...this.layerChannels.keys()]) {
      this.removeLayer(layerId);
    }

    this.delayBuses.clear();
    this.reverbBuses.clear();

    if (this.masterGain) {
      try {
        this.masterGain.disconnect();
      } catch {
        // Already disconnected.
      }
      this.masterGain = null;
    }
    this.boundContext = null;
  }
}
