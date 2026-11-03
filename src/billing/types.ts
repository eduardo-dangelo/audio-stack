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
  | 'duplicate';

export type ExportFormatCapability = 'm4a' | 'wav' | 'vcr';

export type TierCapabilities = {
  maxRecordings: number | null;
  maxLayers: number | null;
  customEffects: boolean;
  import: boolean;
  folders: boolean;
  merge: boolean;
  loop: boolean;
  duplicate: boolean;
  exportFormats: readonly ExportFormatCapability[];
};

export type StoreEntitlements = {
  hasPlus: boolean;
  hasPro: boolean;
};
