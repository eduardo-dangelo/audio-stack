import { requireNativeModule } from 'expo-modules-core';

export type M4aEncodeQuality = 'low' | 'high';

type AudioEncodeModule = {
  encodeWavToM4a(
    inputUri: string,
    outputUri: string,
    quality: M4aEncodeQuality
  ): Promise<void>;
  isAvailable(): boolean;
};

let nativeModule: AudioEncodeModule | null = null;

function getModule(): AudioEncodeModule | null {
  if (nativeModule) {
    return nativeModule;
  }

  try {
    nativeModule = requireNativeModule<AudioEncodeModule>('AudioEncode');
    return nativeModule;
  } catch {
    return null;
  }
}

export async function encodeWavToM4a(
  inputUri: string,
  outputUri: string,
  quality: M4aEncodeQuality = 'high'
): Promise<void> {
  const module = getModule();
  if (!module?.isAvailable()) {
    throw new Error(
      'M4A encoding is not available. Rebuild the app with a native build that includes audio-encode.'
    );
  }

  await module.encodeWavToM4a(inputUri, outputUri, quality);
}
