import { useMemo, useRef, useState } from 'react';
import { LayoutChangeEvent, Platform, StyleSheet, Text, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

import { colorDesaturatedWithAlpha } from '@/constants/VoiceMemosColors';
import { hasAnySoloActive } from '@/src/audio/layerEffects';
import {
  barsPerCycleAtPps,
  loopPeakIndex,
  normalizePeakAt,
  peakToAbsoluteScale,
  slicePeaksForTrim,
  WAVEFORM_BAR_GAP,
  WAVEFORM_BAR_WIDTH,
} from '@/src/audio/waveform';
import { appendWaveformBarRect } from '@/src/components/waveformViewport';
import { resolveTrackColor } from '@/src/components/TrackColorPicker';
import type { Memo } from '@/src/storage/types';
import {
  getLayerActiveDuration,
  getLayerActiveStartTime,
  getLayerEffects,
  getLayerFootprintDuration,
  getLayerLoopCount,
} from '@/src/storage/types';
import { useVoiceMemosColors } from '@/src/theme/useVoiceMemosColors';

const BAR_STEP = WAVEFORM_BAR_WIDTH + WAVEFORM_BAR_GAP;
const LANE_HEIGHT = 64;
const PLAYHEAD_LINE_WIDTH = 2;
const PLAYHEAD_CAP_SIZE = 6;
/** Keep a faint hint of track hue; mostly grayscale. */
const UNPLAYED_SATURATION = 0.12;
const UNPLAYED_ALPHA = 0.45;
const PAN_ACTIVE_OFFSET_X = 8;
/** Slightly loose so minor diagonal scrubs still win over vertical list scroll. */
const PAN_FAIL_OFFSET_Y = 24;
const TAP_MAX_DISTANCE = 10;
const SCRUB_ENGINE_THROTTLE_MS = 32;
const SCRUB_ENGINE_THROTTLE_ANDROID_MS = 100;
const isAndroid = Platform.OS === 'android';

type MiniTrack = {
  id: string;
  peaks?: number[];
  startTime: number;
  duration: number;
  cycleDuration: number;
  color: string;
  isMuted: boolean;
  isSoloed: boolean;
  isSoloedOut: boolean;
  isLocked: boolean;
  isLooped: boolean;
  loopCount?: number;
};

type LaneGeometry = {
  id: string;
  left: number;
  trackWidth: number;
  isMuted: boolean;
  isSoloed: boolean;
  isLocked: boolean;
  isLooped: boolean;
  loopCount?: number;
  activeColorKey: string;
  fullPath: string;
};

type Props = {
  memo: Memo;
  currentTime: number;
  duration: number;
  onSeek: (time: number) => void;
  onScrubStart?: () => void;
  onScrubEnd?: () => void;
  onPress?: () => void;
};

function buildMiniTracks(memo: Memo): MiniTrack[] {
  const anySoloActive = hasAnySoloActive(memo.layers.map((entry) => getLayerEffects(entry)));

  return [...memo.layers]
    .filter((layer) => layer.duration > 0)
    .sort((a, b) => b.order - a.order)
    .map((layer) => {
      const effects = getLayerEffects(layer);
      const activeDuration = getLayerActiveDuration(layer);
      const footprintDuration = getLayerFootprintDuration(layer);
      const loopCount = getLayerLoopCount(layer);
      return {
        id: layer.id,
        peaks: slicePeaksForTrim(
          layer.waveformPeaks,
          layer.duration,
          effects.trimIn,
          effects.trimOut
        ),
        startTime: getLayerActiveStartTime(layer),
        duration: Math.max(footprintDuration, 0.01),
        cycleDuration: Math.max(activeDuration, 0.01),
        color: resolveTrackColor(layer.color),
        isMuted: Boolean(effects.muted),
        isSoloed: Boolean(effects.solo),
        isSoloedOut: anySoloActive && !effects.solo,
        isLocked: Boolean(effects.locked),
        isLooped: loopCount > 1,
        loopCount: loopCount > 1 ? loopCount : undefined,
      };
    });
}

function timeFromX(x: number, width: number, duration: number): number {
  if (width <= 0 || duration <= 0) {
    return 0;
  }
  const ratio = Math.max(0, Math.min(1, x / width));
  return ratio * duration;
}

function clampPlayheadX(x: number, width: number): number {
  'worklet';
  if (width <= 0) {
    return 0;
  }
  return Math.max(0, Math.min(width, x));
}

export function MiniWaveformTracks({
  memo,
  currentTime,
  duration,
  onSeek,
  onScrubStart,
  onScrubEnd,
  onPress,
}: Props) {
  const colors = useVoiceMemosColors();
  const styles = useStyles(colors);
  const [width, setWidth] = useState(0);
  const tracks = useMemo(() => buildMiniTracks(memo), [memo]);
  const widthRef = useRef(width);
  const durationRef = useRef(duration);
  const onSeekRef = useRef(onSeek);
  const onScrubStartRef = useRef(onScrubStart);
  const onScrubEndRef = useRef(onScrubEnd);
  const onPressRef = useRef(onPress);
  const scrubActiveRef = useRef(false);
  const scrubTimeRef = useRef<number | null>(null);
  const lastEngineSeekAtRef = useRef(0);

  const playheadXSV = useSharedValue(0);
  const widthSV = useSharedValue(0);
  const lastAndroidSeekMsSV = useSharedValue(0);

  widthRef.current = width;
  durationRef.current = duration;
  onSeekRef.current = onSeek;
  onScrubStartRef.current = onScrubStart;
  onScrubEndRef.current = onScrubEnd;
  onPressRef.current = onPress;
  widthSV.value = width;

  const pushEngineSeek = (time: number, force: boolean) => {
    const now = Date.now();
    if (!force && now - lastEngineSeekAtRef.current < SCRUB_ENGINE_THROTTLE_MS) {
      return;
    }
    lastEngineSeekAtRef.current = now;
    onSeekRef.current(time);
  };

  /** iOS: update playhead SV + 32ms seeks (tint follows playhead via clip). */
  const applyScrubX = (x: number, force: boolean) => {
    const clampedX = Math.max(0, Math.min(widthRef.current, x));
    const time = timeFromX(clampedX, widthRef.current, durationRef.current);
    scrubTimeRef.current = time;
    playheadXSV.value = clampedX;
    pushEngineSeek(time, force);
  };

  const handlePanStart = (x: number) => {
    scrubActiveRef.current = true;
    lastEngineSeekAtRef.current = 0;
    onScrubStartRef.current?.();
    applyScrubX(x, true);
  };

  const handlePanUpdate = (x: number) => {
    if (!scrubActiveRef.current) {
      return;
    }
    applyScrubX(x, false);
  };

  const handlePanEnd = () => {
    if (!scrubActiveRef.current) {
      return;
    }
    scrubActiveRef.current = false;
    const time = scrubTimeRef.current;
    if (time != null) {
      pushEngineSeek(time, true);
    }
    onScrubEndRef.current?.();
    scrubTimeRef.current = null;
  };

  /** Android: playhead already moved on UI thread; JS only seeks. */
  const handleAndroidPanStart = (x: number) => {
    scrubActiveRef.current = true;
    lastEngineSeekAtRef.current = 0;
    onScrubStartRef.current?.();
    const time = timeFromX(x, widthRef.current, durationRef.current);
    scrubTimeRef.current = time;
    onSeekRef.current(time);
  };

  const handleAndroidSeek = (x: number) => {
    if (!scrubActiveRef.current) {
      return;
    }
    const time = timeFromX(x, widthRef.current, durationRef.current);
    scrubTimeRef.current = time;
    onSeekRef.current(time);
  };

  const handleAndroidPanEnd = (x: number) => {
    if (!scrubActiveRef.current) {
      return;
    }
    scrubActiveRef.current = false;
    const time = timeFromX(x, widthRef.current, durationRef.current);
    scrubTimeRef.current = null;
    onSeekRef.current(time);
    onScrubEndRef.current?.();
  };

  const handleTap = () => {
    onPressRef.current?.();
  };

  const gesture = useMemo(() => {
    const tap = Gesture.Tap()
      .maxDistance(TAP_MAX_DISTANCE)
      .onEnd(() => {
        'worklet';
        runOnJS(handleTap)();
      });

    if (isAndroid) {
      return Gesture.Exclusive(
        Gesture.Pan()
          .activeOffsetX([-PAN_ACTIVE_OFFSET_X, PAN_ACTIVE_OFFSET_X])
          .failOffsetY([-PAN_FAIL_OFFSET_Y, PAN_FAIL_OFFSET_Y])
          .onStart((event) => {
            'worklet';
            const x = clampPlayheadX(event.x, widthSV.value);
            playheadXSV.value = x;
            lastAndroidSeekMsSV.value = Date.now();
            runOnJS(handleAndroidPanStart)(x);
          })
          .onUpdate((event) => {
            'worklet';
            const x = clampPlayheadX(event.x, widthSV.value);
            playheadXSV.value = x;
            const now = Date.now();
            if (now - lastAndroidSeekMsSV.value >= SCRUB_ENGINE_THROTTLE_ANDROID_MS) {
              lastAndroidSeekMsSV.value = now;
              runOnJS(handleAndroidSeek)(x);
            }
          })
          .onEnd((event) => {
            'worklet';
            const x = clampPlayheadX(event.x, widthSV.value);
            playheadXSV.value = x;
            runOnJS(handleAndroidPanEnd)(x);
          })
          .onFinalize((event, success) => {
            'worklet';
            if (!success) {
              const x = clampPlayheadX(event.x, widthSV.value);
              playheadXSV.value = x;
              runOnJS(handleAndroidPanEnd)(x);
            }
          }),
        tap
      );
    }

    return Gesture.Exclusive(
      Gesture.Pan()
        .activeOffsetX([-PAN_ACTIVE_OFFSET_X, PAN_ACTIVE_OFFSET_X])
        .failOffsetY([-PAN_FAIL_OFFSET_Y, PAN_FAIL_OFFSET_Y])
        .onStart((event) => {
          'worklet';
          runOnJS(handlePanStart)(event.x);
        })
        .onUpdate((event) => {
          'worklet';
          runOnJS(handlePanUpdate)(event.x);
        })
        .onEnd(() => {
          'worklet';
          runOnJS(handlePanEnd)();
        })
        .onFinalize((_event, success) => {
          'worklet';
          if (!success) {
            runOnJS(handlePanEnd)();
          }
        }),
      tap
    );
    // Handlers close over refs; gesture instance is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional
  }, []);

  const onLayout = (event: LayoutChangeEvent) => {
    const next = Math.round(event.nativeEvent.layout.width);
    if (next > 0 && next !== width) {
      setWidth(next);
    }
  };

  if (!scrubActiveRef.current && width > 0 && duration > 0) {
    playheadXSV.value =
      Math.max(0, Math.min(1, currentTime / duration)) * width;
  }

  // Static geometry + one full SVG path per lane (no scrub/time dependency).
  const laneGeometry = useMemo((): LaneGeometry[] | null => {
    if (tracks.length === 0 || duration <= 0 || width <= 0) {
      return null;
    }
    const laneHeight = LANE_HEIGHT;
    const maxBarHeight = Math.max(2, laneHeight - 2);
    const effectivePps = duration > 0 ? width / duration : 0;

    return tracks.map((track) => {
      const left = (track.startTime / duration) * width;
      const trackWidth = Math.max(0, (track.duration / duration) * width);
      const barCount = Math.max(0, Math.floor(trackWidth / BAR_STEP));
      const barsPerCycle = barsPerCycleAtPps(track.cycleDuration, effectivePps, BAR_STEP);
      const cycleBarCount = Math.max(1, Math.floor(barsPerCycle));
      let fullPath = '';
      for (let index = 0; index < barCount; index++) {
        const peakIndex = loopPeakIndex(index, barsPerCycle, cycleBarCount);
        const peak = normalizePeakAt(track.peaks, cycleBarCount, peakIndex);
        const scaled = peakToAbsoluteScale(peak);
        const barHeight =
          scaled <= 0.01
            ? 1
            : Math.max(1.5, Math.min(maxBarHeight, scaled * maxBarHeight));
        fullPath = appendWaveformBarRect(
          fullPath,
          index * BAR_STEP,
          (LANE_HEIGHT - barHeight) / 2,
          WAVEFORM_BAR_WIDTH,
          barHeight
        );
      }

      return {
        id: track.id,
        left,
        trackWidth,
        isMuted: track.isMuted,
        isSoloed: track.isSoloed,
        isLocked: track.isLocked,
        isLooped: track.isLooped,
        loopCount: track.loopCount,
        activeColorKey:
          track.isMuted || track.isSoloedOut ? '__waveformBar__' : track.color,
        fullPath,
      };
    });
  }, [tracks, width, duration]);

  const playheadAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: playheadXSV.value }],
  }));

  const playedTintClipStyle = useAnimatedStyle(() => ({
    width: playheadXSV.value,
  }));

  if (tracks.length === 0 || duration <= 0) {
    return null;
  }

  const totalHeight = tracks.length * LANE_HEIGHT;

  const renderLaneWaveform = (lane: LaneGeometry, fill: string) => {
    if (lane.trackWidth <= 0 || !lane.fullPath) {
      return null;
    }
    return (
      <View
        style={[
          styles.barsRow,
          { left: lane.left, width: lane.trackWidth, height: LANE_HEIGHT },
        ]}>
        <Svg height={LANE_HEIGHT} width={Math.max(1, lane.trackWidth)}>
          <Path d={lane.fullPath} fill={fill} />
        </Svg>
      </View>
    );
  };

  const renderLaneBadges = (lane: LaneGeometry) => {
    if (lane.trackWidth <= 0) {
      return null;
    }
    return (
      <View
        pointerEvents="none"
        style={[
          styles.floatingStatusRow,
          { left: lane.left + 4, maxWidth: Math.max(0, lane.trackWidth - 8) },
        ]}>
        {lane.isMuted ? (
          <View style={[styles.inlineBadge, styles.mutedBadge]}>
            <Text style={styles.mutedBadgeText}>M</Text>
          </View>
        ) : null}
        {lane.isSoloed ? (
          <View style={[styles.inlineBadge, styles.soloBadge]}>
            <Text style={styles.soloBadgeText}>S</Text>
          </View>
        ) : null}
        {lane.isLocked ? (
          <View style={styles.inlineLock}>
            <SymbolView
              name={{ ios: 'lock.fill' }}
              size={11}
              tintColor={colors.lockBadge}
            />
          </View>
        ) : null}
        {lane.isLooped ? (
          <View style={[styles.inlineLock, styles.inlineLoop]}>
            <SymbolView
              name={{ ios: 'repeat' }}
              size={11}
              tintColor={colors.lockBadge}
            />
            {lane.loopCount != null && lane.loopCount > 1 ? (
              <Text style={[styles.loopCountText, { color: colors.lockBadge }]}>
                {lane.loopCount}×
              </Text>
            ) : null}
          </View>
        ) : null}
      </View>
    );
  };

  const unplayedLanes =
    laneGeometry == null
      ? null
      : laneGeometry.map((lane) => {
          const activeColor =
            lane.activeColorKey === '__waveformBar__'
              ? colors.waveformBar
              : lane.activeColorKey;
          const unplayedColor = colorDesaturatedWithAlpha(
            activeColor,
            UNPLAYED_SATURATION,
            UNPLAYED_ALPHA
          );
          return (
            <View
              key={lane.id}
              style={[
                styles.lane,
                {
                  height: LANE_HEIGHT,
                  backgroundColor: colors.waveformBandBackground,
                },
              ]}>
              {renderLaneWaveform(lane, unplayedColor)}
            </View>
          );
        });

  const playedLanes =
    laneGeometry == null
      ? null
      : laneGeometry.map((lane) => {
          const activeColor =
            lane.activeColorKey === '__waveformBar__'
              ? colors.waveformBar
              : lane.activeColorKey;
          return (
            <View
              key={`played-${lane.id}`}
              style={[
                styles.lane,
                {
                  height: LANE_HEIGHT,
                  backgroundColor: colors.waveformBandBackground,
                },
              ]}>
              {renderLaneWaveform(lane, activeColor)}
            </View>
          );
        });

  const badgeLanes =
    laneGeometry == null
      ? null
      : laneGeometry.map((lane) => (
          <View
            key={`badges-${lane.id}`}
            pointerEvents="none"
            style={[styles.lane, { height: LANE_HEIGHT }]}>
            {renderLaneBadges(lane)}
          </View>
        ));

  return (
    <GestureDetector gesture={gesture}>
      <View
        accessibilityLabel="Edit Recording"
        accessibilityRole="button"
        importantForAccessibility="yes"
        style={[styles.container, { height: totalHeight }]}
        onLayout={onLayout}>
        <View style={[styles.lanesClip, { height: totalHeight }]}>
          {unplayedLanes}
          {width > 0 ? (
            <Animated.View
              pointerEvents="none"
              style={[
                styles.playedTintClip,
                { height: totalHeight },
                playedTintClipStyle,
              ]}>
              <View style={{ width, height: totalHeight }}>{playedLanes}</View>
            </Animated.View>
          ) : null}
          <View pointerEvents="none" style={styles.badgeOverlay}>
            {badgeLanes}
          </View>
        </View>
        {width > 0 ? (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.playhead,
              { height: totalHeight },
              playheadAnimatedStyle,
            ]}>
            <View style={styles.playheadCapTop} />
            <View style={styles.playheadLine} />
            <View style={styles.playheadCapBottom} />
          </Animated.View>
        ) : null}
      </View>
    </GestureDetector>
  );
}

function useStyles(colors: ReturnType<typeof useVoiceMemosColors>) {
  return useMemo(
    () =>
      StyleSheet.create({
        container: {
          width: '100%',
          overflow: 'visible',
          borderRadius: 6,
          marginTop: 4,
        },
        lanesClip: {
          width: '100%',
          overflow: 'hidden',
          borderRadius: 6,
        },
        playedTintClip: {
          position: 'absolute',
          top: 0,
          left: 0,
          overflow: 'hidden',
          zIndex: 2,
        },
        badgeOverlay: {
          ...StyleSheet.absoluteFillObject,
          zIndex: 6,
        },
        lane: {
          width: '100%',
          overflow: 'hidden',
        },
        barsRow: {
          position: 'absolute',
          top: 0,
        },
        bar: {
          position: 'absolute',
          borderRadius: 1,
        },
        floatingBadge: {
          position: 'absolute',
          top: 4,
        },
        floatingLock: {
          position: 'absolute',
          top: 3,
          zIndex: 6,
          width: 14,
          height: 16,
          alignItems: 'center',
          justifyContent: 'center',
        },
        floatingLoop: {
          width: 'auto',
          minWidth: 14,
          flexDirection: 'row',
          gap: 2,
          paddingHorizontal: 1,
        },
        floatingStatusRow: {
          position: 'absolute',
          top: 3,
          zIndex: 6,
          flexDirection: 'row',
          alignItems: 'center',
          overflow: 'hidden',
        },
        inlineBadge: {
          marginLeft: 4,
        },
        inlineLock: {
          marginLeft: 4,
          zIndex: 6,
          width: 14,
          height: 16,
          alignItems: 'center',
          justifyContent: 'center',
        },
        inlineLoop: {
          width: 'auto',
          minWidth: 14,
          flexDirection: 'row',
          gap: 2,
          paddingHorizontal: 1,
        },
        loopCountText: {
          fontSize: 10,
          fontWeight: '700',
          lineHeight: 14,
        },
        mutedBadge: {
          zIndex: 6,
          minWidth: 14,
          height: 13,
          borderRadius: 2,
          paddingHorizontal: 3,
          backgroundColor: colors.secondaryText,
          alignItems: 'center',
          justifyContent: 'center',
        },
        mutedBadgeText: {
          fontSize: 9,
          fontWeight: '700',
          color: colors.background,
          lineHeight: 11,
        },
        soloBadge: {
          zIndex: 6,
          minWidth: 14,
          height: 13,
          borderRadius: 2,
          paddingHorizontal: 3,
          backgroundColor: colors.soloBadge,
          alignItems: 'center',
          justifyContent: 'center',
        },
        soloBadgeText: {
          fontSize: 9,
          fontWeight: '700',
          color: colors.soloBadgeText,
          lineHeight: 11,
        },
        playhead: {
          position: 'absolute',
          top: 0,
          left: 0,
          width: PLAYHEAD_LINE_WIDTH,
          marginLeft: -PLAYHEAD_LINE_WIDTH / 2,
          alignItems: 'center',
          justifyContent: 'space-between',
          overflow: 'visible',
          zIndex: 10,
        },
        playheadCapTop: {
          width: PLAYHEAD_CAP_SIZE,
          height: PLAYHEAD_CAP_SIZE,
          borderRadius: PLAYHEAD_CAP_SIZE / 2,
          backgroundColor: colors.accent,
          marginTop: -PLAYHEAD_CAP_SIZE / 2,
        },
        playheadCapBottom: {
          width: PLAYHEAD_CAP_SIZE,
          height: PLAYHEAD_CAP_SIZE,
          borderRadius: PLAYHEAD_CAP_SIZE / 2,
          backgroundColor: colors.accent,
          marginBottom: -PLAYHEAD_CAP_SIZE / 2,
        },
        playheadLine: {
          flex: 1,
          width: PLAYHEAD_LINE_WIDTH,
          backgroundColor: colors.accent,
        },
      }),
    [colors]
  );
}
