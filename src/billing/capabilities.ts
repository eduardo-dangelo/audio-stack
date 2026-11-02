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
  import: false,
  folders: false,
  merge: false,
  loop: false,
  exportFormats: [],
};

const PLUS_CAPABILITIES: TierCapabilities = {
  maxRecordings: null,
  maxLayers: null,
  customEffects: true,
  import: true,
  folders: true,
  merge: true,
  loop: true,
  exportFormats: ['m4a'],
};

const PRO_CAPABILITIES: TierCapabilities = {
  maxRecordings: null,
  maxLayers: null,
  customEffects: true,
  import: true,
  folders: true,
  merge: true,
  loop: true,
  exportFormats: ['m4a', 'wav', 'vcr'],
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

export function canExportAnything(tier: TierId): boolean {
  return getCapabilities(tier).exportFormats.length > 0;
}

export function resolveEffectiveTier(options: {
  hasPlus: boolean;
  hasPro: boolean;
  devTierOverride: TierId | null;
}): TierId {
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
      return `Lite includes up to ${LITE_MAX_RECORDINGS} recordings`;
    case 'layers':
      return `Lite includes up to ${LITE_MAX_LAYERS} layers`;
    case 'customEffects':
      return 'Custom effects need Plus or Pro';
    case 'import':
      return 'Import needs Plus or Pro';
    case 'export':
      return 'Export needs Plus or Pro';
    case 'exportFormat':
      return 'WAV and .vcr need Pro';
    case 'folders':
      return 'Folders need Plus or Pro';
    case 'merge':
      return 'Merge layers need Plus or Pro';
    case 'loop':
      return 'Loop needs Plus or Pro';
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
