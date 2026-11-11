import { GlassView, isGlassEffectAPIAvailable } from 'expo-glass-effect';
import * as Haptics from 'expo-haptics';
import { useMemo } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { useColorScheme } from '@/components/useColorScheme';
import { AppSymbol } from '@/src/components/AppSymbol';
import {
  getMetronomeMode,
  type MetronomeMode,
  type MetronomeSettings,
} from '@/src/storage/types';
import { useVoiceMemosColors } from '@/src/theme/useVoiceMemosColors';

const LONG_PRESS_DELAY_MS = 400;
const useGlass = isGlassEffectAPIAvailable();
const isAndroid = Platform.OS === 'android';
const BUTTON_SIZE = 32;
const ANDROID_HIT = 48;
const ANDROID_SYMBOL = 22;

type Props = {
  settings: MetronomeSettings;
  headphonesConnected: boolean;
  onCycle: () => void;
  onOpenSettings: () => void;
  disabled?: boolean;
};

function accessibilityLabelForMode(mode: MetronomeMode): string {
  switch (mode) {
    case 'metronome':
      return 'Metronome with grid';
    case 'grid':
      return 'Grid only';
    case 'off':
    default:
      return 'Metronome off';
  }
}

function iconNameForMode(
  mode: MetronomeMode,
  headphonesConnected: boolean
): 'metronome.fill' | 'metronome' | 'rectangle.split.3x1' {
  switch (mode) {
    case 'metronome':
      return 'metronome.fill';
    case 'grid':
      return 'rectangle.split.3x1';
    case 'off':
    default:
      return headphonesConnected ? 'metronome' : 'rectangle.split.3x1';
  }
}

export function MetronomeButton({
  settings,
  headphonesConnected,
  onCycle,
  onOpenSettings,
  disabled = false,
}: Props) {
  const colors = useVoiceMemosColors();
  const colorScheme = useColorScheme();
  const styles = useStyles(colors, colorScheme);
  const mode = getMetronomeMode(settings);
  const enabled = mode !== 'off';
  const iconTint = enabled ? colors.accent : colors.secondaryText;
  const ripple = useMemo(
    () =>
      isAndroid
        ? {
            color: colorScheme === 'dark' ? 'rgba(255,255,255,0.16)' : 'rgba(0,0,0,0.12)',
            borderless: true,
          }
        : undefined,
    [colorScheme]
  );

  const handlePress = () => {
    if (disabled) {
      return;
    }
    void Haptics.selectionAsync();
    onCycle();
  };

  const handleLongPress = () => {
    if (disabled) {
      return;
    }
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onOpenSettings();
  };

  const content = (
    <AppSymbol
      name={iconNameForMode(mode, headphonesConnected)}
      size={isAndroid ? ANDROID_SYMBOL : 18}
      tintColor={iconTint}
    />
  );

  if (isAndroid) {
    return (
      <Pressable
        accessibilityHint="Cycles metronome with grid, grid only, then off"
        accessibilityLabel={accessibilityLabelForMode(mode)}
        accessibilityRole="button"
        accessibilityState={{ selected: enabled, disabled }}
        android_ripple={ripple}
        delayLongPress={LONG_PRESS_DELAY_MS}
        disabled={disabled}
        onLongPress={handleLongPress}
        onPress={handlePress}
        style={[styles.androidHit, disabled && styles.pressableDisabled]}>
        <View style={styles.androidCenter}>{content}</View>
      </Pressable>
    );
  }

  return (
    <Pressable
      accessibilityHint="Cycles metronome with grid, grid only, then off"
      accessibilityLabel={accessibilityLabelForMode(mode)}
      accessibilityRole="button"
      accessibilityState={{ selected: enabled, disabled }}
      delayLongPress={LONG_PRESS_DELAY_MS}
      disabled={disabled}
      onLongPress={handleLongPress}
      onPress={handlePress}
      style={[
        styles.pressable,
        enabled && styles.pressableEnabled,
        disabled && styles.pressableDisabled,
      ]}>
      {useGlass ? (
        <GlassView
          glassEffectStyle="regular"
          isInteractive={!disabled}
          style={styles.glass}>
          {content}
        </GlassView>
      ) : (
        <View style={styles.fallback}>{content}</View>
      )}
    </Pressable>
  );
}

function useStyles(
  colors: ReturnType<typeof useVoiceMemosColors>,
  colorScheme: 'light' | 'dark' | null | undefined
) {
  const buttonSurface =
    colorScheme === 'dark' ? colors.sheetBackground : colors.background;

  return useMemo(
    () =>
      StyleSheet.create({
        pressable: {
          width: BUTTON_SIZE,
          height: BUTTON_SIZE,
          borderRadius: BUTTON_SIZE / 2,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: 'transparent',
        },
        pressableEnabled: {
          borderColor: colors.accent,
        },
        pressableDisabled: {
          opacity: 0.4,
        },
        glass: {
          width: BUTTON_SIZE,
          height: BUTTON_SIZE,
          borderRadius: BUTTON_SIZE / 2,
          alignItems: 'center',
          justifyContent: 'center',
        },
        fallback: {
          width: BUTTON_SIZE,
          height: BUTTON_SIZE,
          borderRadius: BUTTON_SIZE / 2,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: buttonSurface,
          shadowColor: '#000000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: colorScheme === 'dark' ? 0.35 : 0.12,
          shadowRadius: 4,
          elevation: 3,
        },
        androidHit: {
          width: ANDROID_HIT,
          height: ANDROID_HIT,
          borderRadius: ANDROID_HIT / 2,
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        },
        androidCenter: {
          alignItems: 'center',
          justifyContent: 'center',
        },
      }),
    [buttonSurface, colorScheme, colors.accent]
  );
}
