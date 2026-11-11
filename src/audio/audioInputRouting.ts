import { AudioManager } from 'react-native-audio-api';
import { AppState, Platform } from 'react-native';

import {
  getNormalizedOutputCategories,
  pickPrimaryOutputCategory,
  resolveDeviceCategory,
} from '@/src/audio/headphoneDetection';
import {
  classifyCueOutputRoute,
  classifyMonitorPath,
  shouldDuckMonitorMixForCategory,
  type CueOutputRoute,
  type MonitorPath,
} from '@/src/audio/recordingLatency';

const BLUETOOTH_INPUT_CATEGORIES = new Set([
  'BluetoothHFP',
  'HeadsetMic',
  'BluetoothLE',
]);

const MIN_STABLE_SAMPLE_RATE = 32000;

export type RouteSnapshot = {
  inputCategory: string | null;
  outputCategory: string | null;
  sessionSampleRate: number;
  isHfpActive: boolean;
};

type DeviceLike = {
  id: string;
  category?: string;
  type?: string;
  name?: string;
};

function firstNormalizedCategory(
  devices: DeviceLike[] | undefined
): string | null {
  if (!devices?.length) {
    return null;
  }
  for (const device of devices) {
    const category = resolveDeviceCategory(device);
    if (category) {
      return category;
    }
  }
  return null;
}

/**
 * Active input category for the session.
 * iOS: prefer `currentInputs`.
 * Android: `currentInputs` is empty — prefer BuiltInMic (pin target), not the
 * first listed headset mic which is often present when headphones are plugged in.
 */
function resolveInputCategory(
  currentInputs: DeviceLike[] | undefined,
  availableInputs: DeviceLike[] | undefined
): string | null {
  const current = firstNormalizedCategory(currentInputs);
  if (current) {
    return current;
  }

  const available = availableInputs ?? [];
  for (const device of available) {
    if (resolveDeviceCategory(device) === 'BuiltInMic') {
      return 'BuiltInMic';
    }
  }
  for (const device of available) {
    const category = resolveDeviceCategory(device);
    if (category && !BLUETOOTH_INPUT_CATEGORIES.has(category)) {
      return category;
    }
  }
  return firstNormalizedCategory(available);
}

export async function findBuiltInMicrophone(): Promise<{
  id: string;
  category: string;
} | null> {
  const devices = await AudioManager.getDevicesInfo();
  const inputs = (devices.availableInputs ?? []) as DeviceLike[];

  const builtIn = inputs.find(
    (device) => resolveDeviceCategory(device) === 'BuiltInMic'
  );
  if (builtIn) {
    return { id: builtIn.id, category: 'BuiltInMic' };
  }

  for (const device of inputs) {
    const category = resolveDeviceCategory(device);
    if (category && !BLUETOOTH_INPUT_CATEGORIES.has(category)) {
      return { id: device.id, category };
    }
  }

  return null;
}

export async function pinBuiltInMicrophone(): Promise<void> {
  const builtIn = await findBuiltInMicrophone();
  if (!builtIn) {
    throw new Error('Built-in microphone is not available');
  }
  await AudioManager.setInputDevice(builtIn.id);
}

export async function getActiveRouteSnapshot(): Promise<RouteSnapshot> {
  const devices = await AudioManager.getDevicesInfo();
  const inputCategory = resolveInputCategory(
    devices.currentInputs as DeviceLike[] | undefined,
    devices.availableInputs as DeviceLike[] | undefined
  );
  const outputCategories = await getNormalizedOutputCategories();
  const outputCategory = pickPrimaryOutputCategory(outputCategories);
  const sessionSampleRate = Math.round(AudioManager.getDevicePreferredSampleRate());

  // Only the resolved primary categories — listing SCO among availableOutputs
  // must not block stack on Android.
  const isHfpActive =
    inputCategory === 'BluetoothHFP' || outputCategory === 'BluetoothHFP';

  return {
    inputCategory,
    outputCategory,
    sessionSampleRate,
    isHfpActive,
  };
}

export async function assertRecordingRouteOk(): Promise<RouteSnapshot> {
  const snapshot = await getActiveRouteSnapshot();

  if (snapshot.isHfpActive) {
    throw new Error(
      "Couldn't start recording with a stable audio route. Try disconnecting and reconnecting your headphones."
    );
  }

  if (
    snapshot.inputCategory !== null &&
    BLUETOOTH_INPUT_CATEGORIES.has(snapshot.inputCategory)
  ) {
    throw new Error(
      "Couldn't use the iPhone microphone. Try disconnecting and reconnecting your headphones."
    );
  }

  if (snapshot.sessionSampleRate < MIN_STABLE_SAMPLE_RATE) {
    throw new Error(
      "Couldn't start recording with a stable audio route. Try disconnecting and reconnecting your headphones."
    );
  }

  return snapshot;
}

export function logRouteSnapshot(label: string, snapshot: RouteSnapshot): void {
  if (!__DEV__) {
    return;
  }
  console.log(
    `[audio route] ${label}`,
    JSON.stringify(snapshot)
  );
}

export async function getCueOutputRoute(): Promise<CueOutputRoute> {
  try {
    const snapshot = await getActiveRouteSnapshot();
    return classifyCueOutputRoute(snapshot.outputCategory);
  } catch {
    return 'wired';
  }
}

export async function getMonitorPath(): Promise<MonitorPath> {
  try {
    const snapshot = await getActiveRouteSnapshot();
    return classifyMonitorPath(snapshot.outputCategory);
  } catch {
    return 'headphones';
  }
}

export async function shouldDuckMonitorMixNow(): Promise<boolean> {
  try {
    const snapshot = await getActiveRouteSnapshot();
    return shouldDuckMonitorMixForCategory(snapshot.outputCategory);
  } catch {
    return false;
  }
}

/** Initial check + live updates whenever the audio route changes. */
export function subscribeCueOutputRoute(
  onChange: (route: CueOutputRoute) => void
): () => void {
  let cancelled = false;

  const refresh = () => {
    void getCueOutputRoute().then((route) => {
      if (!cancelled) {
        onChange(route);
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

/** Live monitor-path updates for latency preview (headphones vs speakerBleed). */
export function subscribeMonitorPath(
  onChange: (path: MonitorPath) => void
): () => void {
  let cancelled = false;

  const refresh = () => {
    void getMonitorPath().then((path) => {
      if (!cancelled) {
        onChange(path);
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
