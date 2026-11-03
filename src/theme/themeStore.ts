import {
  getThemePreferenceSync,
  type ThemePreference,
} from '@/src/settings/appSettings';

let current = getThemePreferenceSync();
const listeners = new Set<() => void>();

export function getThemePreferenceLive(): ThemePreference {
  return current;
}

export function publishThemePreference(next: ThemePreference): void {
  if (current === next) {
    return;
  }
  current = next;
  listeners.forEach((listener) => listener());
}

export function subscribeTheme(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
