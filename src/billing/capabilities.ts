import type {
  ExportFormatCapability,
  TierCapabilities,
  TierId,
  UpgradeReason,
} from './types';

export const LITE_MAX_RECORDINGS = 10;
export const LITE_MAX_LAYERS = 5;

const LITE_CAPABILITIES: TierCapabilities = {
  maxRecordings: LITE_MAX_RECORDINGS,
  maxLayers: LITE_MAX_LAYERS,
  customEffects: false,
  import: true,
  folders: false,
  merge: false,
  loop: false,
  duplicate: false,
  themes: false,
  pitch: false,
  /** Low-quality M4A only; WAV / .aud remain paid. */
  exportFormats: ['m4a'],
};

const PLUS_CAPABILITIES: TierCapabilities = {
  maxRecordings: null,
  maxLayers: null,
  customEffects: true,
  import: true,
  folders: true,
  merge: true,
  loop: false,
  duplicate: false,
  themes: false,
  pitch: false,
  exportFormats: ['m4a', 'wav'],
};

const PRO_CAPABILITIES: TierCapabilities = {
  maxRecordings: null,
  maxLayers: null,
  customEffects: true,
  import: true,
  folders: true,
  merge: true,
  loop: true,
  duplicate: true,
  themes: true,
  pitch: true,
  exportFormats: ['m4a', 'wav', 'aud'],
};

export function getCapabilities(tier: TierId): TierCapabilities {
  switch (tier) {
    case 'pro':
      return PRO_CAPABILITIES;
    case 'plus':
      return PLUS_CAPABILITIES;
    case 'lite':
    default:
      return LITE_CAPABILITIES;
  }
}

export function canExportFormat(
  tier: TierId,
  format: ExportFormatCapability
): boolean {
  return getCapabilities(tier).exportFormats.includes(format);
}

export function canCreateRecording(
  tier: TierId,
  activeRecordingCount: number
): boolean {
  const max = getCapabilities(tier).maxRecordings;
  if (max === null) {
    return true;
  }
  return activeRecordingCount < max;
}

export function canAddPlayableLayer(tier: TierId, playableLayerCount: number): boolean {
  const max = getCapabilities(tier).maxLayers;
  if (max === null) {
    return true;
  }
  return playableLayerCount < max;
}

export function canUseCustomEffects(tier: TierId): boolean {
  return getCapabilities(tier).customEffects;
}

export function canImport(tier: TierId): boolean {
  return getCapabilities(tier).import;
}

export function canCreateFolder(tier: TierId): boolean {
  return getCapabilities(tier).folders;
}

export function canUseMerge(tier: TierId): boolean {
  return getCapabilities(tier).merge;
}

export function canUseLoop(tier: TierId): boolean {
  return getCapabilities(tier).loop;
}

export function canDuplicate(tier: TierId): boolean {
  return getCapabilities(tier).duplicate;
}

export function canUseThemes(tier: TierId): boolean {
  return getCapabilities(tier).themes;
}

export function canUsePitch(tier: TierId): boolean {
  return getCapabilities(tier).pitch;
}

export function canExportAnything(tier: TierId): boolean {
  return getCapabilities(tier).exportFormats.length > 0;
}

export function resolveEffectiveTier(options: {
  hasPlus: boolean;
  hasPro: boolean;
  devTierOverride: TierId | null;
  ribbonSkew?: boolean;
}): TierId {
  if (options.ribbonSkew) {
    return 'pro';
  }
  if (__DEV__ && options.devTierOverride) {
    return options.devTierOverride;
  }
  if (options.hasPro) {
    return 'pro';
  }
  if (options.hasPlus) {
    return 'plus';
  }
  return 'lite';
}

/** One-line paywall subtitle for the limit that was hit. */
export function paywallSubtitle(reason: UpgradeReason): string {
  switch (reason) {
    case 'recordings':
      return `Unlimited recordings on Plus and Pro. Lite includes up to ${LITE_MAX_RECORDINGS}.`;
    case 'layers':
      return `Unlimited layers on Plus and Pro. Lite includes up to ${LITE_MAX_LAYERS}.`;
    case 'customEffects':
      return 'Custom effects are included with Plus and Pro.';
    case 'import':
      return 'Importing audio and projects is included on every plan.';
    case 'export':
      return 'Lite includes low-quality M4A. WAV needs Plus; project (.aud) needs Pro.';
    case 'exportFormat':
      return 'WAV export is included with Plus. Project (.aud) export needs Pro.';
    case 'folders':
      return 'Folders are included with Plus and Pro.';
    case 'merge':
      return 'Merging layers is included with Plus and Pro.';
    case 'loop':
      return 'Looping is included with Pro.';
    case 'duplicate':
      return 'Duplicating is included with Pro.';
    case 'themes':
      return 'Solarized themes need Plus. Named IDE themes need Pro.';
    case 'pitch':
      return 'Pitch shift is included with Pro.';
  }
}

export function tierDisplayName(tier: TierId): string {
  switch (tier) {
    case 'pro':
      return 'Pro';
    case 'plus':
      return 'Plus';
    case 'lite':
    default:
      return 'Lite';
  }
}
