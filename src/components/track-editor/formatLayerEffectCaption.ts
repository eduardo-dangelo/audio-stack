import type { LayerEffects } from '@/src/audio/layerEffects';

import type { EditorTool } from './types';

const PAN_CENTER_EPSILON = 0.001;

function formatSignedDecimal(value: number, digits: number): string {
  const fixed = value.toFixed(digits);
  if (value > 0) {
    return `+${fixed}`;
  }
  return fixed;
}

function formatSignedInteger(value: number): string {
  if (value > 0) {
    return `+${value}`;
  }
  return String(value);
}

export function formatVolumeCaption(volumeDb: number): string {
  return `${formatSignedDecimal(volumeDb, 1)} dB`;
}

export function formatPanCaption(pan: number): string {
  if (Math.abs(pan) < PAN_CENTER_EPSILON) {
    return 'C';
  }
  const percent = Math.round(Math.abs(pan) * 100);
  return pan < 0 ? `L ${percent}` : `R ${percent}`;
}

export function formatPitchCaption(pitchSemitones: number): string {
  return `${formatSignedInteger(Math.round(pitchSemitones))} st`;
}

export function formatLayerEffectCaption(
  tool: EditorTool,
  effects: LayerEffects
): string | null {
  switch (tool) {
    case 'volume':
      return formatVolumeCaption(effects.volumeDb);
    case 'pan':
      return formatPanCaption(effects.pan);
    case 'pitch':
      return formatPitchCaption(effects.pitchSemitones);
    default:
      return null;
  }
}
