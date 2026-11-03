import { useLayoutEffect } from 'react';
import { Appearance } from 'react-native';
import { useSyncExternalStore } from 'react';

import { getEffectiveTierSync, subscribeBilling } from '@/src/billing/effectiveTierStore';
import { getThemePreferenceSync, type ThemePreference } from '@/src/settings/appSettings';

import { getThemePreferenceLive, subscribeTheme } from './themeStore';
import { appearanceForTheme, resolveEffectiveTheme } from './themes';

export function applyThemePreference(pref: ThemePreference): void {
  const appearance = appearanceForTheme(pref);
  Appearance.setColorScheme(appearance === 'system' ? 'unspecified' : appearance);
}

/** Keeps status bar and dark-mode branches on the theme that the tier may use. */
export function ThemeAppearanceSync() {
  const preference = useSyncExternalStore(
    subscribeTheme,
    getThemePreferenceLive,
    getThemePreferenceLive
  );
  const tier = useSyncExternalStore(
    subscribeBilling,
    getEffectiveTierSync,
    getEffectiveTierSync
  );

  useLayoutEffect(() => {
    applyThemePreference(resolveEffectiveTheme(preference, tier));
  }, [preference, tier]);

  return null;
}

export function applyStoredThemePreference(): void {
  applyThemePreference(
    resolveEffectiveTheme(getThemePreferenceSync(), getEffectiveTierSync())
  );
}
