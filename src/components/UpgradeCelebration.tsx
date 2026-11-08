import * as Haptics from 'expo-haptics';
import { SymbolView } from 'expo-symbols';
import { useEffect, useLayoutEffect, useState } from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  ZoomIn,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';
import type { SFSymbol } from 'sf-symbols-typescript';

import {
  registerUpgradeCelebration,
  type CelebrationTier,
} from '@/src/billing/celebrationBridge';
import { useVoiceMemosColors } from '@/src/theme/useVoiceMemosColors';

const PARTICLE_COUNT = 16;
const CELEBRATION_MS = 1600;

const PRO_STAR_PATH =
  'M7.50 0.30L9.29 5.03L14.35 5.28L10.40 8.44L11.73 13.32L7.50 10.55L3.27 13.32L4.60 8.44L0.65 5.28L5.71 5.03Z';

const PARTICLE_SYMBOLS: SFSymbol[] = [
  'sparkles',
  'star.fill',
  'crown.fill',
  'waveform',
  'seal.fill',
];

type ParticleSpec = {
  id: number;
  symbol: SFSymbol;
  angle: number;
  distance: number;
  delay: number;
  size: number;
};

const PARTICLES: ParticleSpec[] = Array.from({ length: PARTICLE_COUNT }, (_, id) => ({
  id,
  symbol: PARTICLE_SYMBOLS[id % PARTICLE_SYMBOLS.length]!,
  angle: (id / PARTICLE_COUNT) * Math.PI * 2 + (id % 3) * 0.12,
  distance: 90 + (id % 5) * 28,
  delay: 40 + (id % 8) * 35,
  size: 16 + (id % 4) * 3,
}));

function BurstParticle({
  spec,
  tint,
}: {
  spec: ParticleSpec;
  tint: string;
}) {
  const progress = useSharedValue(0);
  const opacity = useSharedValue(1);

  useEffect(() => {
    progress.value = withDelay(
      spec.delay,
      withTiming(1, { duration: 900, easing: Easing.out(Easing.cubic) })
    );
    opacity.value = withDelay(
      spec.delay + 550,
      withTiming(0, { duration: 450, easing: Easing.in(Easing.quad) })
    );
  }, [opacity, progress, spec.delay]);

  const style = useAnimatedStyle(() => {
    const x = Math.cos(spec.angle) * spec.distance * progress.value;
    const y = Math.sin(spec.angle) * spec.distance * progress.value;
    const scale = 0.35 + progress.value * 0.9;
    return {
      opacity: opacity.value,
      transform: [{ translateX: x }, { translateY: y }, { scale }],
    };
  });

  return (
    <Animated.View style={[styles.particle, style]}>
      <SymbolView name={{ ios: spec.symbol }} size={spec.size} tintColor={tint} />
    </Animated.View>
  );
}

function ProStarMark({ size = 18 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 15 15">
      <Defs>
        <LinearGradient
          id="celebrationProStar"
          x1="0"
          y1="0"
          x2={size}
          y2={size}
          gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor="#6AABFF" />
          <Stop offset="0.4" stopColor="#2B7FFF" />
          <Stop offset="0.7" stopColor="#1A66E0" />
          <Stop offset="1" stopColor="#4C96FF" />
        </LinearGradient>
      </Defs>
      <Path d={PRO_STAR_PATH} fill="url(#celebrationProStar)" />
    </Svg>
  );
}

type Props = {
  tier: CelebrationTier;
  onFinished: () => void;
};

function UpgradeCelebrationOverlay({ tier, onFinished }: Props) {
  const colors = useVoiceMemosColors();

  useEffect(() => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const timer = setTimeout(onFinished, CELEBRATION_MS);
    return () => clearTimeout(timer);
  }, [onFinished]);

  const tint = tier === 'pro' ? '#4C96FF' : colors.accent;
  const labelColor = tier === 'pro' ? '#2B7FFF' : colors.accent;

  return (
    <Modal animationType="none" transparent visible statusBarTranslucent>
      <View pointerEvents="none" style={styles.backdrop}>
        <View style={styles.burstOrigin}>
          {PARTICLES.map((spec) => (
            <BurstParticle key={spec.id} spec={spec} tint={tint} />
          ))}
          <Animated.View
            entering={ZoomIn.springify().damping(12).stiffness(160)}
            style={[styles.badge, { backgroundColor: colors.sheetBackground }]}>
            <SymbolView name={{ ios: 'lock.open.fill' }} size={22} tintColor={labelColor} />
            <View style={styles.tierRow}>
              {tier === 'pro' ? (
                <ProStarMark size={18} />
              ) : (
                <SymbolView name={{ ios: 'sparkles' }} size={18} tintColor={labelColor} />
              )}
              <Text style={[styles.badgeText, { color: labelColor }]}>
                {tier === 'pro' ? 'Pro' : 'Plus'}
              </Text>
            </View>
          </Animated.View>
        </View>
      </View>
    </Modal>
  );
}

/** Mount once near the app root so billing can present the burst. */
export function UpgradeCelebrationHost() {
  const [tier, setTier] = useState<CelebrationTier | null>(null);

  useLayoutEffect(() => {
    registerUpgradeCelebration((next) => {
      setTier(next);
    });
    return () => registerUpgradeCelebration(null);
  }, []);

  if (tier == null) {
    return null;
  }

  return (
    <UpgradeCelebrationOverlay
      tier={tier}
      onFinished={() => {
        setTier(null);
      }}
    />
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.18)',
  },
  burstOrigin: {
    width: 1,
    height: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  particle: {
    position: 'absolute',
  },
  badge: {
    position: 'absolute',
    minWidth: 88,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  tierRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  badgeText: {
    fontSize: 22,
    fontWeight: '700',
  },
});
