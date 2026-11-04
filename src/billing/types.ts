export type TierId = 'lite' | 'plus' | 'pro';

export type UpgradeReason =
  | 'recordings'
  | 'layers'
  | 'customEffects'
  | 'import'
  | 'export'
  | 'exportFormat'
  | 'folders'
  | 'merge'
  | 'loop'
  | 'duplicate'
  | 'themes'
  | 'pitch';

export type ExportFormatCapability = 'm4a' | 'wav' | 'aud';

export type TierCapabilities = {
  maxRecordings: number | null;
  maxLayers: number | null;
  customEffects: boolean;
  import: boolean;
  folders: boolean;
  merge: boolean;
  loop: boolean;
  duplicate: boolean;
  themes: boolean;
  pitch: boolean;
  exportFormats: readonly ExportFormatCapability[];
};

export type StoreEntitlements = {
  hasPlus: boolean;
  hasPro: boolean;
};
