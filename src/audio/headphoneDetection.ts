import { AudioManager } from 'react-native-audio-api';
import { AppState, Platform } from 'react-native';

import { isSealedHeadphoneCategory } from '@/src/audio/recordingLatency';
import type { Memo } from '@/src/storage/types';
import { getPlayableLayers } from '@/src/storage/types';

/**
 * TEMP (alignment QA): allow metronome + stack/replace without headphones.
 * Set back to `false` (or delete) after speaker-stack testing.
 */
export const ALLOW_METRONOME_WITHOUT_HEADPHONES = false;

const SPEAKER_CATEGORIES = new Set(['BuiltInSpeaker', 'BuiltInReceiver']);

const HEADPHONE_CATEGORIES = new Set([
  'Headphones',
  'HeadsetMic',
  'BluetoothA2DP',
  'BluetoothHFP',
  'BluetoothLE',
  'USBAudio',
  'LineOut',
  'HDMI',
  'AirPlay',
  'CarAudio',
]);

/** Android `AudioDeviceInfo` type labels from react-native-audio-api → iOS AVAudioSession categories. */
const ANDROID_TYPE_TO_CATEGORY: Record<string, string> = {
  'Wired Headphones': 'Headphones',
  'Wired Headset': 'HeadsetMic',
  'Bluetooth A2DP': 'BluetoothA2DP',
  'Bluetooth SCO': 'BluetoothHFP',
  'Built-in Speaker': 'BuiltInSpeaker',
  'Built-in Earpiece': 'BuiltInReceiver',
  'Built-in Mic': 'BuiltInMic',
};

type DeviceLike = {
  category?: string;
  type?: string;
  id?: string;
  name?: string;
};

function isHeadphoneCategory(category: string): boolean {
  if (HEADPHONE_CATEGORIES.has(category)) {
    return true;
  }
  if (SPEAKER_CATEGORIES.has(category)) {
    return false;
  }
  return category.length > 0 && !category.toLowerCase().includes('speaker');
}

/** Resolve iOS `category` or Android `type` into a canonical AVAudioSession-style category. */
export function resolveDeviceCategory(device: DeviceLike): string | null {
  if (typeof device.category === 'string' && device.category.length > 0) {
    return device.category;
  }
  if (typeof device.type === 'string' && device.type.length > 0) {
    return ANDROID_TYPE_TO_CATEGORY[device.type] ?? null;
  }
  return null;
}

function categoriesFromDevices(devices: DeviceLike[] | undefined): string[] {
  if (!devices?.length) {
    return [];
  }
  const categories: string[] = [];
  for (const device of devices) {
    const category = resolveDeviceCategory(device);
    if (category) {
      categories.push(category);
    }
  }
  return categories;
}

/**
 * Canonical output categories for the current session.
 * iOS: active `currentOutputs` (category).
 * Android: `currentOutputs` is empty — use `availableOutputs` and map `type` strings.
 */
export async function getNormalizedOutputCategories(): Promise<string[]> {
  const devices = await AudioManager.getDevicesInfo();
  const current = categoriesFromDevices(devices.currentOutputs as DeviceLike[] | undefined);
  if (current.length > 0) {
    return current;
  }
  return categoriesFromDevices(devices.availableOutputs as DeviceLike[] | undefined);
}

/** Prefer a headphone/sealed path when several outputs are listed (common on Android). */
export function pickPrimaryOutputCategory(categories: string[]): string | null {
  const headphone = categories.find(isHeadphoneCategory);
  if (headphone) {
    return headphone;
  }
  const nonSpeaker = categories.find((category) => !SPEAKER_CATEGORIES.has(category));
  return nonSpeaker ?? categories[0] ?? null;
}

/** True when any normalized output category is a headphone/external cue path. */
export function hasHeadphoneOutput(categories: string[]): boolean {
  return categories.some(isHeadphoneCategory);
}

export async function isHeadphonesConnected(): Promise<boolean> {
  try {
    const categories = await getNormalizedOutputCategories();
    return hasHeadphoneOutput(categories);
  } catch {
    return false;
  }
}

export function needsMonitorMix(memo: Memo, mode: 'replace' | 'stack'): boolean {
  if (mode === 'stack') {
    return true;
  }
  return mode === 'replace' && getPlayableLayers(memo).length > 1;
}

/**
 * True when at least one current output is a sealed/private cue path
 * (wired headphones, USB, in-ear BT). Built-in speaker and room remotes
 * are not sealed — see recordingLatency.classifyMonitorPath.
 */
export async function isSealedHeadphonesConnected(): Promise<boolean> {
  try {
    const categories = await getNormalizedOutputCategories();
    return categories.some(isSealedHeadphoneCategory);
  } catch {
    return false;
  }
}

// Unlock / Live Activity allow prompts fire ConfigurationChange without a real unplug.
const DISCONNECT_ROUTE_REASONS = new Set(['OldDeviceUnavailable']);

export function subscribeHeadphoneDisconnect(onDisconnect: () => void): () => void {
  const checkDisconnected = () => {
    void isHeadphonesConnected().then((connected) => {
      if (!connected) {
        onDisconnect();
      }
    });
  };

  const subscription = AudioManager.addSystemEventListener('routeChange', (event) => {
    if (!DISCONNECT_ROUTE_REASONS.has(event.reason)) {
      return;
    }
    checkDisconnected();
  });

  // Android may not emit routeChange on unplug — re-check when returning to foreground.
  const appSub = AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      checkDisconnected();
    }
  });

  return () => {
    subscription?.remove();
    appSub.remove();
  };
}

/** Initial check + live updates whenever the audio route changes. */
export function subscribeHeadphonesConnected(
  onChange: (connected: boolean) => void
): () => void {
  let cancelled = false;

  const refresh = () => {
    void isHeadphonesConnected().then((connected) => {
      if (!cancelled) {
        onChange(connected);
      }
    });
  };

  refresh();
  const subscription = AudioManager.addSystemEventListener('routeChange', () => {
    refresh();
  });
  const appSub = AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      refresh();
    }
  });

  // Android lacks a reliable headset routeChange — poll while subscribed.
  let interval: ReturnType<typeof setInterval> | undefined;
  if (Platform.OS === 'android') {
    interval = setInterval(refresh, 2000);
  }

  return () => {
    cancelled = true;
    subscription?.remove();
    appSub.remove();
    if (interval) {
      clearInterval(interval);
    }
  };
}
