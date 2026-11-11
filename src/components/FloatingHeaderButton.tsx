import { GlassView, isGlassEffectAPIAvailable } from 'expo-glass-effect';
import { memo, useMemo } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ColorValue,
} from 'react-native';

import { useColorScheme } from '@/components/useColorScheme';
import { AppSymbol } from '@/src/components/AppSymbol';
import { useVoiceMemosColors } from '@/src/theme/useVoiceMemosColors';

export type FloatingHeaderIcon =
  | 'magnifyingglass'
  | 'ellipsis'
  | 'ellipsis.circle'
  | 'gearshape'
  | 'gearshape.fill'
  | 'folder.badge.plus'
  | 'chevron.left'
  | 'square.and.arrow.up'
  | 'square.and.arrow.down'
  | 'pencil'
  | 'checkmark'
  | 'checkmark.square'
  | 'plus.square.on.square'
  | 'trash'
  | 'sidebar.left'
  | 'arrow.up.left.and.arrow.down.right';

export type FloatingHeaderIconSize = 'regular' | 'small';

type BaseProps = {
  onPress: () => void;
  accessibilityLabel: string;
};

type IconProps = BaseProps & {
  variant?: 'icon';
  icon: FloatingHeaderIcon;
  label?: never;
  tintColor?: ColorValue;
  size?: FloatingHeaderIconSize;
};

type PillProps = BaseProps & {
  variant: 'pill';
  label: string;
  icon?: never;
  tintColor?: never;
  size?: never;
};

type Props = IconProps | PillProps;

type IconFaceProps = {
  icon: FloatingHeaderIcon;
  accessibilityLabel?: string;
  tintColor?: ColorValue;
  size?: FloatingHeaderIconSize;
};

const useGlass = isGlassEffectAPIAvailable();
const isAndroid = Platform.OS === 'android';

const ICON_SIZE = {
  regular: { button: 44, symbol: 22, androidButton: 48, androidSymbol: 24 },
  small: { button: 32, symbol: 16, androidButton: 40, androidSymbol: 20 },
} as const;

/** Icon chrome without a Pressable — for MenuView / other native triggers. */
export const FloatingHeaderIconFace = memo(function FloatingHeaderIconFace({
  icon,
  accessibilityLabel,
  tintColor,
  size = 'regular',
}: IconFaceProps) {
  const colors = useVoiceMemosColors();
  const colorScheme = useColorScheme();
  const styles = useStyles(colors, colorScheme, size);
  const iconTint = tintColor ?? colors.accent;
  const symbolSize = isAndroid ? ICON_SIZE[size].androidSymbol : ICON_SIZE[size].symbol;
  const content = <AppSymbol name={icon} size={symbolSize} tintColor={iconTint} />;

  if (isAndroid) {
    return (
      <View accessibilityLabel={accessibilityLabel} style={styles.androidIconHit}>
        <View style={styles.androidIconCenter}>{content}</View>
      </View>
    );
  }

  return (
    <View accessibilityLabel={accessibilityLabel} style={styles.iconPressable}>
      {useGlass ? (
        <GlassView isInteractive glassEffectStyle="regular" style={styles.iconGlass}>
          {content}
        </GlassView>
      ) : (
        <View style={styles.iconFallback}>{content}</View>
      )}
    </View>
  );
});

export function FloatingHeaderButton({
  onPress,
  accessibilityLabel,
  variant = 'icon',
  icon,
  label,
  tintColor,
  size = 'regular',
}: Props) {
  const colors = useVoiceMemosColors();
  const colorScheme = useColorScheme();
  const styles = useStyles(colors, colorScheme, size);
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

  if (variant === 'pill' || !icon) {
    if (isAndroid) {
      return (
        <Pressable
          accessibilityLabel={accessibilityLabel}
          accessibilityRole="button"
          android_ripple={ripple}
          hitSlop={8}
          onPress={onPress}
          style={styles.androidTextButton}>
          <Text style={styles.pillText}>{label}</Text>
        </Pressable>
      );
    }

    const content = <Text style={styles.pillText}>{label}</Text>;
    return (
      <Pressable
        accessibilityLabel={accessibilityLabel}
        hitSlop={8}
        onPress={onPress}
        style={styles.pillPressable}>
        {useGlass ? (
          <GlassView isInteractive glassEffectStyle="regular" style={styles.pillGlass}>
            {content}
          </GlassView>
        ) : (
          <View style={styles.pillFallback}>{content}</View>
        )}
      </Pressable>
    );
  }

  if (isAndroid) {
    const symbolSize = ICON_SIZE[size].androidSymbol;
    const iconTint = tintColor ?? colors.accent;
    return (
      <Pressable
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="button"
        android_ripple={ripple}
        hitSlop={4}
        onPress={onPress}
        style={styles.androidIconHit}>
        <View style={styles.androidIconCenter}>
          <AppSymbol name={icon} size={symbolSize} tintColor={iconTint} />
        </View>
      </Pressable>
    );
  }

  return (
    <Pressable accessibilityLabel={accessibilityLabel} hitSlop={8} onPress={onPress}>
      <FloatingHeaderIconFace icon={icon} size={size} tintColor={tintColor} />
    </Pressable>
  );
}

function useStyles(
  colors: ReturnType<typeof useVoiceMemosColors>,
  colorScheme: 'light' | 'dark' | null | undefined,
  size: FloatingHeaderIconSize
) {
  const buttonSurface =
    colorScheme === 'dark' ? colors.sheetBackground : colors.background;
  const buttonSize = ICON_SIZE[size].button;
  const androidButtonSize = ICON_SIZE[size].androidButton;
  const radius = buttonSize / 2;

  return useMemo(
    () =>
      StyleSheet.create({
        iconPressable: {
          width: buttonSize,
          height: buttonSize,
          borderRadius: radius,
        },
        iconGlass: {
          width: buttonSize,
          height: buttonSize,
          borderRadius: radius,
          alignItems: 'center',
          justifyContent: 'center',
        },
        iconFallback: {
          width: buttonSize,
          height: buttonSize,
          borderRadius: radius,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: buttonSurface,
          shadowColor: '#000000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: colorScheme === 'dark' ? 0.35 : 0.12,
          shadowRadius: 4,
          elevation: 3,
        },
        androidIconHit: {
          width: androidButtonSize,
          height: androidButtonSize,
          borderRadius: androidButtonSize / 2,
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        },
        androidIconCenter: {
          alignItems: 'center',
          justifyContent: 'center',
        },
        androidTextButton: {
          minHeight: 48,
          paddingHorizontal: 12,
          justifyContent: 'center',
          alignItems: 'center',
          borderRadius: 24,
          overflow: 'hidden',
        },
        pillPressable: {
          borderRadius: 18,
          minHeight: 36,
          justifyContent: 'center',
        },
        pillGlass: {
          borderRadius: 18,
          paddingHorizontal: 14,
          paddingVertical: 7,
          minHeight: 36,
          justifyContent: 'center',
          alignItems: 'center',
        },
        pillFallback: {
          backgroundColor: buttonSurface,
          borderRadius: 18,
          paddingHorizontal: 14,
          paddingVertical: 7,
          minHeight: 36,
          justifyContent: 'center',
          shadowColor: '#000000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: colorScheme === 'dark' ? 0.35 : 0.12,
          shadowRadius: 4,
          elevation: 3,
        },
        pillText: {
          color: colors.accent,
          fontSize: 16,
          fontWeight: '500',
        },
      }),
    [androidButtonSize, buttonSize, buttonSurface, colorScheme, colors.accent, radius]
  );
}
