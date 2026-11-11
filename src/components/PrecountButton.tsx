import { GlassView, isGlassEffectAPIAvailable } from 'expo-glass-effect';
import * as Haptics from 'expo-haptics';
import { useMemo } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { useColorScheme } from '@/components/useColorScheme';
import { AppSymbol } from '@/src/components/AppSymbol';
import type { PrecountMode } from '@/src/storage/types';
import { useVoiceMemosColors } from '@/src/theme/useVoiceMemosColors';

const useGlass = isGlassEffectAPIAvailable();
const isAndroid = Platform.OS === 'android';
const BUTTON_SIZE = 32;
const ANDROID_HIT = 48;
const ANDROID_SYMBOL = 22;

type Props = {
  mode: PrecountMode;
  onCycle: () => void;
  disabled?: boolean;
};

function accessibilityLabelForMode(mode: PrecountMode): string {
  switch (mode) {
    case 'sound':
      return 'Precount on with sound';
    case 'silent':
      return 'Precount on silent';
    case 'off':
    default:
      return 'Precount off';
  }
}

export function PrecountButton({ mode, onCycle, disabled = false }: Props) {
  const colors = useVoiceMemosColors();
  const colorScheme = useColorScheme();
  const styles = useStyles(colors, colorScheme);
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

  // sound: filled 4 · silent: mute on Android, outline 4 on iOS · off: outline/count 4
  const iconName =
    mode === 'sound'
      ? '4.circle.fill'
      : mode === 'silent' && isAndroid
        ? 'speaker.slash'
        : '4.circle';

  const content = (
    <AppSymbol
      name={iconName}
      size={isAndroid ? ANDROID_SYMBOL : 18}
      tintColor={iconTint}
    />
  );

  if (isAndroid) {
    return (
      <Pressable
        accessibilityHint="Cycles precount: with sound, silent, then off"
        accessibilityLabel={accessibilityLabelForMode(mode)}
        accessibilityRole="button"
        accessibilityState={{ selected: enabled, disabled }}
        android_ripple={ripple}
        disabled={disabled}
        onPress={handlePress}
        style={[styles.androidHit, disabled && styles.pressableDisabled]}>
        <View style={styles.androidCenter}>{content}</View>
      </Pressable>
    );
  }

  return (
    <Pressable
      accessibilityHint="Cycles precount: with sound, silent, then off"
      accessibilityLabel={accessibilityLabelForMode(mode)}
      accessibilityRole="button"
      accessibilityState={{ selected: enabled, disabled }}
      disabled={disabled}
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
