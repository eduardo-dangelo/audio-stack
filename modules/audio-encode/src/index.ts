import { requireNativeModule } from 'expo-modules-core';

type AudioEncodeModule = {
  encodeWavToM4a(inputUri: string, outputUri: string): Promise<void>;
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

export async function encodeWavToM4a(inputUri: string, outputUri: string): Promise<void> {
  const module = getModule();
  if (!module?.isAvailable()) {
    throw new Error(
      'M4A encoding is not available on this platform yet. On iOS, rebuild with npx expo run:ios. On Android, export WAV for now.'
    );
  }

  await module.encodeWavToM4a(inputUri, outputUri);
}
