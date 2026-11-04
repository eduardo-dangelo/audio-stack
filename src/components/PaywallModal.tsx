import { SymbolView } from 'expo-symbols';
import { useMemo, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { SFSymbol } from 'sf-symbols-typescript';

import { useColorScheme } from '@/components/useColorScheme';
import { useBilling } from '@/src/billing/BillingProvider';
import {
  LITE_MAX_LAYERS,
  LITE_MAX_RECORDINGS,
  paywallSubtitle,
} from '@/src/billing/capabilities';
import type { TierId, UpgradeReason } from '@/src/billing/types';
import { useDuoSideColumn } from '@/src/hooks/useDuoSideColumn';
import { useVoiceMemosColors } from '@/src/theme/useVoiceMemosColors';

/** Closed Duo rail: leave the status cluster on the dimmed editor, sheet full width over the rail. */
const CLOSED_RAIL_TOP_CLEARANCE = 160;
const CLOSED_RAIL_MIN_SHEET = 360;

const HEADER_HEIGHT = 52;
const ROW_HEIGHT = 32;
const CTA_HEIGHT = 40;
const LABEL_WIDTH = 100;
const PRO_STAR_TINT = '#FFCC00';

type FeatureRow = {
  label: string;
  symbol: SFSymbol;
  lite: boolean | string;
  plus: boolean | string;
  pro: boolean | string;
  highlightReasons?: UpgradeReason[];
};

const FEATURES: FeatureRow[] = [
  {
    label: 'Recordings',
    symbol: 'waveform',
    lite: String(LITE_MAX_RECORDINGS),
    plus: '∞',
    pro: '∞',
    highlightReasons: ['recordings'],
  },
  {
    label: 'Layers',
    symbol: 'square.stack.3d.up',
    lite: String(LITE_MAX_LAYERS),
    plus: '∞',
    pro: '∞',
    highlightReasons: ['layers'],
  },
  {
    label: 'Import',
    symbol: 'square.and.arrow.down',
    lite: true,
    plus: true,
    pro: true,
    highlightReasons: ['import'],
  },
  {
    label: 'Custom FX',
    symbol: 'slider.horizontal.3',
    lite: false,
    plus: true,
    pro: true,
    highlightReasons: ['customEffects'],
  },
  {
    label: 'Folders',
    symbol: 'folder',
    lite: false,
    plus: true,
    pro: true,
    highlightReasons: ['folders'],
  },
  {
    label: 'M4A export',
    symbol: 'square.and.arrow.up',
    lite: false,
    plus: true,
    pro: true,
    highlightReasons: ['export'],
  },
  {
    label: 'Duplicate',
    symbol: 'plus.square.on.square',
    lite: false,
    plus: false,
    pro: true,
    highlightReasons: ['duplicate'],
  },
  {
    label: 'Merge',
    symbol: 'square.stack.3d.down.right',
    lite: false,
    plus: false,
    pro: true,
    highlightReasons: ['merge'],
  },
  {
    label: 'Loop',
    symbol: 'repeat',
    lite: false,
    plus: false,
    pro: true,
    highlightReasons: ['loop'],
  },
  {
    label: 'WAV / .aud',
    symbol: 'doc',
    lite: false,
    plus: false,
    pro: true,
    highlightReasons: ['exportFormat'],
  },
  {
    label: 'Themes',
    symbol: 'paintbrush',
    lite: false,
    plus: false,
    pro: true,
    highlightReasons: ['themes'],
  },
];

const TIERS: TierId[] = ['lite', 'plus', 'pro'];

function cellValue(tier: TierId, feature: FeatureRow): boolean | string {
  if (tier === 'lite') {
    return feature.lite;
  }
  if (tier === 'plus') {
    return feature.plus;
  }
  return feature.pro;
}

function FeatureCell({
  value,
  styles,
  colors,
}: {
  value: boolean | string;
  styles: ReturnType<typeof useStyles>;
  colors: ReturnType<typeof useVoiceMemosColors>;
}) {
  if (value === true) {
    return (
      <SymbolView
        name={{ ios: 'checkmark' as SFSymbol }}
        size={13}
        tintColor={colors.accent}
      />
    );
  }
  if (value === false) {
    return <Text style={styles.cellMuted}>–</Text>;
  }
  return (
    <Text style={styles.cellText} numberOfLines={1}>
      {value}
    </Text>
  );
}

export type PaywallScreenProps = {
  reason?: UpgradeReason | null;
  onClose: () => void;
};

/** Paywall content for `/paywall` route and in-editor Modal. */
export function PaywallScreen({ reason = null, onClose }: PaywallScreenProps) {
  const colors = useVoiceMemosColors();
  const colorScheme = useColorScheme();
  const styles = useStyles(colors, colorScheme);
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const sideColumn = useDuoSideColumn();
  const closedRail = sideColumn.edge != null;
  const closedRailMaxHeight = Math.max(
    CLOSED_RAIL_MIN_SHEET,
    windowHeight - insets.top - CLOSED_RAIL_TOP_CLEARANCE
  );
  const {
    effectiveTier,
    plusPriceLabel,
    proPriceLabel,
    purchasePlus,
    purchasePro,
    manageSubscriptions,
    purchasing,
    hasPlus,
    hasPro,
  } = useBilling();

  const tierMeta: Record<
    TierId,
    { title: string; price: string; symbol: SFSymbol | null; recommended: boolean }
  > = {
    lite: {
      title: 'Lite',
      price: 'Free',
      symbol: null,
      recommended: false,
    },
    plus: {
      title: 'Plus',
      price: plusPriceLabel,
      symbol: 'sparkles',
      // Plus when upgrading from Lite for a reason that is not Pro-only.
      recommended:
        effectiveTier === 'lite' &&
        reason != null &&
        reason !== 'exportFormat' &&
        reason !== 'themes' &&
        reason !== 'duplicate' &&
        reason !== 'merge' &&
        reason !== 'loop',
    },
    pro: {
      title: 'Pro',
      price: proPriceLabel,
      symbol: 'star.fill',
      recommended:
        reason === 'exportFormat' ||
        reason === 'themes' ||
        reason === 'duplicate' ||
        reason === 'merge' ||
        reason === 'loop',
    },
  };

  const ctaFor = (tier: TierId): { label: string; kind: 'current' | 'owned' | 'action' | 'empty'; onPress?: () => void } => {
    if (tier === 'lite') {
      return effectiveTier === 'lite'
        ? { label: 'Current', kind: 'current' }
        : { label: '', kind: 'empty' };
    }
    if (tier === 'plus') {
      if (effectiveTier === 'plus') {
        return { label: 'Current', kind: 'current' };
      }
      if (hasPlus) {
        return { label: 'Owned', kind: 'owned' };
      }
      if (effectiveTier === 'lite') {
        return {
          label: 'Buy Plus',
          kind: 'action',
          onPress: () => void purchasePlus(),
        };
      }
      return { label: '', kind: 'empty' };
    }
    if (effectiveTier === 'pro') {
      return { label: 'Current', kind: 'current' };
    }
    return {
      label: 'Subscribe',
      kind: 'action',
      onPress: () => void purchasePro(),
    };
  };

  const hasRecommended = TIERS.some((tier) => tierMeta[tier].recommended);
  const columnTone = (tier: TierId, edge?: 'top' | 'bottom', rowActive = false) => [
    styles.tierCol,
    hasRecommended && tier === 'lite' ? styles.tierColLite : null,
    tierMeta[tier].recommended ? styles.tierColWide : null,
    effectiveTier === tier && !rowActive ? styles.tierColCurrent : null,
    tierMeta[tier].recommended ? styles.tierColHighlighted : null,
    tierMeta[tier].recommended ? styles.tierColRecommended : null,
    tierMeta[tier].recommended && edge === 'top' ? styles.tierColRecommendedTop : null,
    tierMeta[tier].recommended && edge === 'bottom' ? styles.tierColRecommendedBottom : null,
  ];

  const comparison: ReactNode = (
    <>
      <View style={[styles.table, closedRail ? styles.closedRailTable : null]}>
        {/* Header: titles + prices — padding lives on cells so column bg fills the row */}
        <View style={[styles.row, styles.headerRow, closedRail ? styles.closedRailTightRow : null]}>
          <View style={[styles.labelCol, styles.headerCellPad]} />
          {TIERS.map((tier) => (
            <View key={tier} style={[...columnTone(tier, 'top'), styles.headerCellPad]}>
              <View style={styles.tierTitleRow}>
                {tierMeta[tier].symbol ? (
                  <SymbolView
                    name={{ ios: tierMeta[tier].symbol }}
                    size={13}
                    tintColor={tier === 'pro' ? PRO_STAR_TINT : colors.accent}
                  />
                ) : null}
                <Text style={styles.tierTitle} numberOfLines={1}>
                  {tierMeta[tier].title}
                </Text>
              </View>
              <Text style={styles.tierPrice} numberOfLines={1}>
                {tierMeta[tier].price}
              </Text>
              {tierMeta[tier].recommended ? (
                <View style={styles.recommendedPill}>
                  <Text style={styles.recommended} numberOfLines={1}>
                    Recommended
                  </Text>
                </View>
              ) : (
                <View style={styles.recommendedSpacer} />
              )}
            </View>
          ))}
        </View>

        {/* Feature rows */}
        {FEATURES.map((feature, index) => {
          const highlighted =
            reason != null && feature.highlightReasons?.includes(reason);
          return (
            <View
              key={feature.label}
              style={[
                styles.row,
                closedRail ? styles.closedRailFeatureRow : styles.featureRow,
                highlighted ? styles.featureRowActive : null,
                index < FEATURES.length - 1 ? styles.featureRowBorder : null,
              ]}>
              <View style={styles.labelCol}>
                <SymbolView
                  name={{ ios: feature.symbol }}
                  size={12}
                  tintColor={highlighted ? colors.accent : colors.secondaryText}
                />
                <Text
                  style={[
                    styles.featureLabel,
                    highlighted ? styles.featureLabelHighlight : null,
                  ]}
                  numberOfLines={1}>
                  {feature.label}
                </Text>
              </View>
              {TIERS.map((tier) => (
                <View key={tier} style={columnTone(tier, undefined, highlighted)}>
                  <FeatureCell
                    value={cellValue(tier, feature)}
                    styles={styles}
                    colors={colors}
                  />
                </View>
              ))}
            </View>
          );
        })}

        {/* CTA row — padding on cells so column bg fills the row */}
        <View style={[styles.row, styles.ctaRow, closedRail ? styles.closedRailTightRow : null]}>
          <View style={[styles.labelCol, styles.ctaCellPad]} />
          {TIERS.map((tier) => {
            const cta = ctaFor(tier);
            return (
              <View key={tier} style={[...columnTone(tier, 'bottom'), styles.ctaCellPad]}>
                {cta.kind === 'action' ? (
                  <Pressable
                    accessibilityRole="button"
                    disabled={purchasing}
                    onPress={cta.onPress}
                    style={({ pressed }) => [
                      styles.cta,
                      pressed ? styles.ctaPressed : null,
                      purchasing ? styles.ctaDisabled : null,
                    ]}>
                    <Text style={styles.ctaLabel} numberOfLines={1}>
                      {cta.label}
                    </Text>
                  </Pressable>
                ) : cta.kind === 'current' || cta.kind === 'owned' ? (
                  <Text style={styles.statusLabel} numberOfLines={1}>
                    {cta.label}
                  </Text>
                ) : (
                  <View style={styles.ctaPlaceholder} />
                )}
              </View>
            );
          })}
        </View>
      </View>

      {purchasing ? (
        <ActivityIndicator color={colors.accent} style={styles.spinner} />
      ) : null}

      {hasPro || effectiveTier === 'pro' ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => void manageSubscriptions()}
          style={styles.manageLink}>
          <Text style={styles.manageLinkText}>Manage Subscription</Text>
        </Pressable>
      ) : null}
    </>
  );

  const body: ReactNode = (
    <View
      style={[
        styles.sheet,
        { paddingBottom: Math.max(insets.bottom, 16) },
        closedRail ? { height: closedRailMaxHeight } : null,
      ]}>
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={styles.title}>Choose a plan</Text>
          {reason ? <Text style={styles.reason}>{paywallSubtitle(reason)}</Text> : null}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close"
          onPress={onClose}
          hitSlop={12}
          style={styles.closeButton}>
          <SymbolView name={{ ios: 'xmark' }} size={16} tintColor={colors.secondaryText} />
        </Pressable>
      </View>

      {comparison}
    </View>
  );

  return (
    <View style={styles.screen}>
      <Pressable style={styles.dismissArea} onPress={onClose} />
      <View
        style={[
          styles.sheetChrome,
          closedRail ? { maxHeight: closedRailMaxHeight } : null,
        ]}>
        {body}
      </View>
    </View>
  );
}

function useStyles(
  colors: ReturnType<typeof useVoiceMemosColors>,
  colorScheme: 'light' | 'dark' | null | undefined
) {
  const isDark = colorScheme === 'dark';
  const sheetBg = isDark ? colors.sheetBackground : colors.background;
  const mutedCol = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)';
  const accentWash = isDark ? 'rgba(10,132,255,0.14)' : 'rgba(0,122,255,0.08)';
  const rowHighlight = isDark ? 'rgba(10,132,255,0.07)' : 'rgba(0,122,255,0.045)';
  const accentBorder = colors.accent;

  return useMemo(
    () =>
      StyleSheet.create({
        screen: {
          flex: 1,
          justifyContent: 'flex-end',
          backgroundColor: 'transparent',
        },
        dismissArea: {
          flex: 1,
        },
        sheetChrome: {
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
          overflow: 'hidden',
          backgroundColor: sheetBg,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderColor: colors.separator,
          // Soft lift so the sheet reads as a surface, not glass over waveforms.
          shadowColor: '#000',
          shadowOpacity: isDark ? 0.35 : 0.12,
          shadowRadius: 16,
          shadowOffset: { width: 0, height: -4 },
          elevation: 8,
        },
        sheet: {
          paddingHorizontal: 14,
          paddingTop: 16,
          gap: 14,
        },
        closedRailTable: {
          flex: 1,
          minHeight: 0,
        },
        closedRailFeatureRow: {
          flexGrow: 1,
          flexShrink: 1,
          minHeight: 0,
        },
        closedRailTightRow: {
          flexGrow: 0,
          flexShrink: 1,
          minHeight: 0,
        },
        header: {
          flexDirection: 'row',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 12,
        },
        headerCopy: {
          flex: 1,
          gap: 4,
        },
        title: {
          fontSize: 22,
          fontWeight: '700',
          letterSpacing: -0.3,
          color: colors.text,
        },
        reason: {
          fontSize: 14,
          lineHeight: 19,
          color: colors.secondaryText,
        },
        closeButton: {
          width: 30,
          height: 30,
          borderRadius: 15,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: mutedCol,
        },
        table: {
          borderRadius: 12,
          overflow: 'hidden',
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.separator,
          backgroundColor: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.015)',
        },
        row: {
          flexDirection: 'row',
          alignItems: 'stretch',
          width: '100%',
        },
        headerRow: {
          minHeight: HEADER_HEIGHT + 14,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: colors.separator,
        },
        headerCellPad: {
          paddingTop: 10,
          paddingBottom: 8,
        },
        featureRow: {
          height: ROW_HEIGHT,
        },
        featureRowBorder: {
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: colors.separator,
        },
        featureRowActive: {
          backgroundColor: rowHighlight,
        },
        ctaRow: {
          minHeight: CTA_HEIGHT + 16,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: colors.separator,
        },
        ctaCellPad: {
          paddingTop: 10,
          paddingBottom: 10,
        },
        labelCol: {
          width: LABEL_WIDTH,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 4,
          paddingLeft: 10,
          paddingRight: 4,
        },
        tierCol: {
          flex: 1,
          minWidth: 0,
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: 4,
        },
        tierColLite: {
          flex: 0.8,
        },
        tierColWide: {
          flex: 1.2,
        },
        tierColCurrent: {
          backgroundColor: mutedCol,
        },
        tierColHighlighted: {
          backgroundColor: accentWash,
        },
        tierColRecommended: {
          borderLeftWidth: StyleSheet.hairlineWidth + 2,
          borderRightWidth: StyleSheet.hairlineWidth + 2,
          borderColor: accentBorder,
        },
        tierColRecommendedTop: {
          borderTopWidth: StyleSheet.hairlineWidth + 2,
          borderTopLeftRadius: 12,
          borderTopRightRadius: 12,
          overflow: 'hidden',
        },
        tierColRecommendedBottom: {
          borderBottomWidth: StyleSheet.hairlineWidth + 2,
          borderBottomLeftRadius: 12,
          borderBottomRightRadius: 12,
          overflow: 'hidden',
        },
        tierTitleRow: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 3,
        },
        tierTitle: {
          fontSize: 15,
          fontWeight: '700',
          letterSpacing: -0.2,
          color: colors.text,
        },
        tierPrice: {
          marginTop: 2,
          fontSize: 11,
          fontWeight: '500',
          color: colors.secondaryText,
        },
        recommendedPill: {
          marginTop: 4,
          height: 13,
          paddingHorizontal: 6,
          borderRadius: 6,
          backgroundColor: accentWash,
          alignItems: 'center',
          justifyContent: 'center',
        },
        recommended: {
          fontSize: 9,
          fontWeight: '700',
          letterSpacing: 0.2,
          color: colors.accent,
        },
        recommendedSpacer: {
          height: 13,
          marginTop: 4,
        },
        featureLabel: {
          flex: 1,
          fontSize: 11,
          fontWeight: '500',
          color: colors.secondaryText,
        },
        featureLabelHighlight: {
          color: colors.accent,
          fontWeight: '700',
        },
        cellText: {
          fontSize: 12,
          fontWeight: '600',
          color: colors.text,
        },
        cellMuted: {
          fontSize: 14,
          color: colors.secondaryText,
          opacity: 0.55,
        },
        cta: {
          alignSelf: 'center',
          borderRadius: 10,
          backgroundColor: colors.accent,
          paddingVertical: 8,
          paddingHorizontal: 10,
          alignItems: 'center',
          justifyContent: 'center',
        },
        ctaPressed: {
          opacity: 0.88,
        },
        ctaDisabled: {
          opacity: 0.5,
        },
        ctaLabel: {
          color: '#fff',
          fontSize: 11,
          fontWeight: '700',
        },
        statusLabel: {
          fontSize: 11,
          fontWeight: '600',
          color: colors.accent,
          textAlign: 'center',
        },
        ctaPlaceholder: {
          height: 32,
        },
        spinner: {
          marginTop: 2,
        },
        manageLink: {
          alignSelf: 'center',
          paddingVertical: 4,
        },
        manageLinkText: {
          fontSize: 13,
          fontWeight: '600',
          color: colors.accent,
        },
      }),
    [accentBorder, accentWash, colors, isDark, mutedCol, rowHighlight, sheetBg]
  );
}
