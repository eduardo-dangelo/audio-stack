import type { AudioBufferSourceNode } from 'react-native-audio-api';

import {
  hasActivePitch,
  pitchSemitonesToDetuneCents,
  type LayerEffects,
} from '@/src/audio/layerEffects';

type BufferSourceContext = {
  createBufferSource: (options?: {
    pitchCorrection: boolean;
  }) => AudioBufferSourceNode;
};

/** Plain source when unpitched; Signalsmith stretch only when pitch is active. */
export function createLayerBufferSource(
  context: BufferSourceContext,
  effects: Pick<LayerEffects, 'pitchSemitones'>
): AudioBufferSourceNode {
  if (!hasActivePitch(effects)) {
    return context.createBufferSource();
  }
  const source = context.createBufferSource({ pitchCorrection: true });
  source.detune.value = pitchSemitonesToDetuneCents(effects.pitchSemitones);
  return source;
}

export function applyPitchDetuneToSource(
  source: AudioBufferSourceNode,
  pitchSemitones: number
): void {
  source.detune.value = pitchSemitonesToDetuneCents(pitchSemitones);
}
