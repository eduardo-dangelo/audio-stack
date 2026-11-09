import { GlassView, isGlassEffectAPIAvailable } from 'expo-glass-effect';
import { SymbolView } from 'expo-symbols';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Path, Stop, Text as SvgText } from 'react-native-svg';

import { useColorScheme } from '@/components/useColorScheme';
import type { CelebrationTier } from '@/src/billing/celebrationBridge';
import {
  PLUS_WELCOME_UNLOCKS,
  welcomeUnlocksForTier,
  type WelcomeUnlock,
} from '@/src/billing/welcomeUnlocks';
import {
  LIST_ITEM_ENTER,
  LIST_ITEM_EXIT,
  LIST_ITEM_TRANSITION,
} from '@/src/components/listTransitions';
import { useVoiceMemosColors } from '@/src/theme/useVoiceMemosColors';

const EVERYTHING_IN_PLUS_LABEL = 'Everything in Plus';

const useGlass = isGlassEffectAPIAvailable();

const PRO_STAR_PATH =
  'M7.50 0.30L9.29 5.03L14.35 5.28L10.40 8.44L11.73 13.32L7.50 10.55L3.27 13.32L4.60 8.44L0.65 5.28L5.71 5.03Z';

type UpgradeWelcomeModalProps = {
  visible: boolean;
  tier: CelebrationTier;
  onClose: () => void;
};

/** Same Pro mark as the home large title (star + Pro in one metal sheen). */
function ProTierMark() {
  const width = 52;
  const height = 16;
  return (
    <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <Defs>
        <LinearGradient
          id="welcomeProMetal"
          x1="0"
          y1="0"
          x2={width}
          y2={height}
          gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor="#6AABFF" />
          <Stop offset="0.4" stopColor="#2B7FFF" />
          <Stop offset="0.7" stopColor="#1A66E0" />
          <Stop offset="1" stopColor="#4C96FF" />
        </LinearGradient>
      </Defs>
      <Path d={PRO_STAR_PATH} fill="url(#welcomeProMetal)" transform="translate(0 1.2)" />
      <SvgText fill="url(#welcomeProMetal)" fontSize={15} fontWeight="600" x={19} y={13.2}>
        Pro
      </SvgText>
    </Svg>
  );
}

export function UpgradeWelcomeModal({ visible, tier, onClose }: UpgradeWelcomeModalProps) {
  const colors = useVoiceMemosColors();
  const colorScheme = useColorScheme();
  const styles = useStyles(colors, colorScheme);
  const unlocks = welcomeUnlocksForTier(tier);
  const [plusExpanded, setPlusExpanded] = useState(false);

  useEffect(() => {
    if (!visible) {
      setPlusExpanded(false);
    }
  }, [visible]);

  return (
    <Modal
      animationType={useGlass ? 'none' : 'fade'}
      transparent
      visible={visible}
      onRequestClose={onClose}>
      <Pressable
        style={[styles.backdrop, useGlass && styles.backdropGlass]}
        onPress={onClose}>
        <DialogCard styles={styles} colorScheme={colorScheme}>
          <View style={styles.titleBlock}>
            <View style={styles.brandTitleRow}>
              <Text
                adjustsFontSizeToFit
                minimumFontScale={0.85}
                numberOfLines={1}
                style={styles.brandTitle}>
                Audio Stack
              </Text>
              <View style={styles.tierMark}>
                {tier === 'pro' ? (
                  <ProTierMark />
                ) : (
                  <>
                    <SymbolView
                      name={{ ios: 'sparkles' }}
                      size={15}
                      tintColor={colors.accent}
                    />
                    <Text style={[styles.tierMarkLabel, { color: colors.accent }]}>
                      Plus
                    </Text>
                  </>
                )}
              </View>
            </View>
          </View>
          <Text style={styles.subtitle}>
            Congratulations! Here’s what you unlocked. Enjoy Audio Stack{' '}
            {tier === 'pro' ? 'Pro' : 'Plus'}.
          </Text>
          <ScrollView
            bounces={false}
            style={styles.list}
            contentContainerStyle={styles.listContent}
            keyboardShouldPersistTaps="handled">
            {unlocks.map((item) => {
              const isPlusGroup = item.label === EVERYTHING_IN_PLUS_LABEL;
              return (
                <Animated.View key={item.label} layout={LIST_ITEM_TRANSITION}>
                  <UnlockRow
                    item={item}
                    styles={styles}
                    accentColor={colors.accent}
                    secondaryColor={colors.secondaryText}
                    disclosure={
                      isPlusGroup
                        ? plusExpanded
                          ? 'chevron.down'
                          : 'chevron.right'
                        : undefined
                    }
                    onPress={
                      isPlusGroup
                        ? () => setPlusExpanded((open) => !open)
                        : undefined
                    }
                  />
                  {isPlusGroup && plusExpanded ? (
                    <Animated.View
                      entering={LIST_ITEM_ENTER}
                      exiting={LIST_ITEM_EXIT}
                      layout={LIST_ITEM_TRANSITION}>
                      {PLUS_WELCOME_UNLOCKS.map((plusItem) => (
                        <UnlockRow
                          key={plusItem.label}
                          item={plusItem}
                          styles={styles}
                          accentColor={colors.accent}
                          secondaryColor={colors.secondaryText}
                          nested
                        />
                      ))}
                    </Animated.View>
                  ) : null}
                </Animated.View>
              );
            })}
          </ScrollView>
          <Pressable
            accessibilityRole="button"
            onPress={onClose}
            style={({ pressed }) => [
              styles.enjoyButton,
              pressed && styles.enjoyPressed,
            ]}>
            <Text style={styles.enjoyLabel}>Enjoy</Text>
          </Pressable>
        </DialogCard>
      </Pressable>
    </Modal>
  );
}

function UnlockRow({
  item,
  styles,
  accentColor,
  secondaryColor,
  onPress,
  disclosure,
  nested,
}: {
  item: WelcomeUnlock;
  styles: ReturnType<typeof useStyles>;
  accentColor: string;
  secondaryColor: string;
  onPress?: () => void;
  disclosure?: 'chevron.right' | 'chevron.down';
  nested?: boolean;
}) {
  const content = (
    <>
      <SymbolView name={{ ios: item.symbol }} size={16} tintColor={accentColor} />
      <Text style={styles.rowLabel}>{item.label}</Text>
      {disclosure ? (
        <SymbolView name={{ ios: disclosure }} size={12} tintColor={secondaryColor} />
      ) : null}
    </>
  );

  if (onPress) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: disclosure === 'chevron.down' }}
        accessibilityLabel={
          disclosure === 'chevron.down'
            ? `${item.label}, collapse`
            : `${item.label}, expand`
        }
        onPress={onPress}
        style={({ pressed }) => [
          styles.row,
          nested && styles.rowNested,
          pressed && styles.rowPressed,
        ]}>
        {content}
      </Pressable>
    );
  }

  return (
    <View style={[styles.row, nested && styles.rowNested]}>{content}</View>
  );
}

function DialogCard({
  styles,
  colorScheme,
  children,
}: {
  styles: ReturnType<typeof useStyles>;
  colorScheme: 'light' | 'dark' | null | undefined;
  children: ReactNode;
}) {
  return (
    <Pressable style={styles.cardPressable} onPress={() => {}}>
      {useGlass ? (
        <GlassView
          colorScheme={colorScheme === 'dark' ? 'dark' : 'light'}
          glassEffectStyle="regular"
          isInteractive
          style={styles.cardGlass}>
          {children}
        </GlassView>
      ) : (
        <View style={styles.cardFallback}>{children}</View>
      )}
    </Pressable>
  );
}

function useStyles(
  colors: ReturnType<typeof useVoiceMemosColors>,
  colorScheme: 'light' | 'dark' | null | undefined
) {
  const cardSurface =
    colorScheme === 'dark' ? colors.sheetBackground : colors.background;

  return useMemo(
    () =>
      StyleSheet.create({
        backdrop: {
          flex: 1,
          backgroundColor: colors.overlayBackground,
          justifyContent: 'center',
          alignItems: 'center',
          padding: 24,
        },
        backdropGlass: {
          backgroundColor:
            colorScheme === 'dark' ? 'rgba(0, 0, 0, 0.35)' : 'rgba(0, 0, 0, 0.22)',
        },
        cardPressable: {
          width: '100%',
          maxWidth: 300,
          maxHeight: '78%',
        },
        cardGlass: {
          borderRadius: 20,
          overflow: 'hidden',
          paddingHorizontal: 16,
          paddingTop: 20,
          paddingBottom: 12,
          maxHeight: '100%',
        },
        cardFallback: {
          borderRadius: 20,
          overflow: 'hidden',
          paddingHorizontal: 16,
          paddingTop: 20,
          paddingBottom: 12,
          maxHeight: '100%',
          backgroundColor: cardSurface,
        },
        titleBlock: {
          marginBottom: 6,
        },
        // Matches GroupedListScreen largeTitleRow / largeTitle + home tier mark.
        brandTitleRow: {
          flexDirection: 'row',
          alignItems: 'flex-end',
          gap: 8,
        },
        brandTitle: {
          flexShrink: 1,
          fontSize: 34,
          fontWeight: '700',
          color: colors.text,
        },
        tierMark: {
          flexDirection: 'row',
          alignItems: 'center',
          flexShrink: 0,
          gap: 4,
          marginBottom: 4,
        },
        tierMarkLabel: {
          fontSize: 15,
          fontWeight: '600',
        },
        subtitle: {
          fontSize: 15,
          lineHeight: 20,
          color: colors.secondaryText,
          marginBottom: 14,
        },
        list: {
          flexGrow: 0,
        },
        listContent: {
          paddingBottom: 4,
        },
        row: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          minHeight: 36,
          paddingVertical: 8,
        },
        rowNested: {
          paddingLeft: 24,
          minHeight: 32,
          paddingVertical: 6,
        },
        rowPressed: {
          opacity: 0.55,
        },
        rowLabel: {
          flex: 1,
          fontSize: 14,
          color: colors.text,
        },
        enjoyButton: {
          marginTop: 8,
          paddingVertical: 10,
          alignSelf: 'flex-end',
        },
        enjoyPressed: {
          opacity: 0.55,
        },
        enjoyLabel: {
          fontSize: 17,
          fontWeight: '600',
          color: colors.accent,
        },
      }),
    [
      cardSurface,
      colorScheme,
      colors.accent,
      colors.overlayBackground,
      colors.secondaryText,
      colors.text,
    ]
  );
}
