import { useMemo, useSyncExternalStore } from 'react';

import { useColorScheme } from '@/components/useColorScheme';
import {
  VoiceMemosColorsDark,
  VoiceMemosColorsLight,
  type VoiceMemosColorScheme,
} from '@/constants/VoiceMemosColors';
import { getEffectiveTierSync, subscribeBilling } from '@/src/billing/effectiveTierStore';

import { getThemePreferenceLive, subscribeTheme } from './themeStore';
import { paletteForTheme, resolveEffectiveTheme } from './themes';

export function useVoiceMemosColors(): VoiceMemosColorScheme {
  const scheme = useColorScheme();
  const preference = useSyncExternalStore(
    subscribeTheme,
    getThemePreferenceLive,
    getThemePreferenceLive
  );
  const tier = useSyncExternalStore(subscribeBilling, getEffectiveTierSync, getEffectiveTierSync);
  const effective = resolveEffectiveTheme(preference, tier);

  return useMemo(() => {
    if (effective === 'system') {
      return scheme === 'dark' ? VoiceMemosColorsDark : VoiceMemosColorsLight;
    }
    return paletteForTheme(effective);
  }, [effective, scheme]);
}
