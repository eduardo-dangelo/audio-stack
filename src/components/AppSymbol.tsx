import { isLoaded, loadAsync } from 'expo-font';
import { SymbolView, type AndroidSymbol } from 'expo-symbols';
import regular from 'expo-symbols/androidWeights/regular';
import type { SFSymbol } from 'sf-symbols-typescript';
import { useEffect, useState } from 'react';
import {
  Platform,
  Text,
  View,
  type ColorValue,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

// Package exports block expo-symbols/build/android; load the same codepoints SymbolView uses.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const materialSymbolCodepoints = require('../../node_modules/expo-symbols/build/android/symbols.json') as Record<
  string,
  number
>;

function androidSymbolToString(symbol: AndroidSymbol | null): string | null {
  if (!symbol) {
    return null;
  }
  const code = materialSymbolCodepoints[symbol];
  return typeof code === 'number' ? String.fromCharCode(code) : null;
}

/**
 * SF Symbol → Material Symbols used on Android via expo-symbols.
 * Unmapped names still get a text fallback so chrome never goes blank.
 */
const SF_TO_ANDROID: Record<string, AndroidSymbol> = {
  magnifyingglass: 'search',
  ellipsis: 'more_horiz',
  'ellipsis.circle': 'more_horiz',
  gearshape: 'settings',
  'gearshape.fill': 'settings',
  'folder.badge.plus': 'create_new_folder',
  'chevron.left': 'arrow_back',
  'chevron.right': 'chevron_right',
  'chevron.up': 'expand_less',
  'chevron.down': 'expand_more',
  'square.and.arrow.up': 'ios_share',
  'square.and.arrow.down': 'file_download',
  pencil: 'edit',
  checkmark: 'check',
  'checkmark.square': 'check_box',
  'plus.square.on.square': 'content_copy',
  trash: 'delete',
  'sidebar.left': 'view_sidebar',
  'arrow.up.left.and.arrow.down.right': 'open_in_full',
  xmark: 'close',
  'xmark.circle.fill': 'cancel',

  scissors: 'content_cut',
  'arrow.left.and.right': 'swap_horiz',
  'speaker.wave.2.fill': 'volume_up',
  'hifispeaker.2': 'speaker_group',
  tuningfork: 'music_note',
  'dot.radiowaves.left.and.right': 'graphic_eq',
  'clock.arrow.2.circlepath': 'timelapse',
  'slider.horizontal.3': 'equalizer',

  'play.fill': 'play_arrow',
  'pause.fill': 'pause',
  'stop.fill': 'stop',
  'gobackward.15': 'replay_10',
  'goforward.15': 'forward_10',

  metronome: 'metro',
  'metronome.fill': 'metro',
  'rectangle.split.3x1': 'grid_on',

  '4.circle': 'looks_4',
  '4.circle.fill': 'looks_4',
  'speaker.slash': 'volume_off',

  // Memo / IconActionSheet options
  waveform: 'graphic_eq',
  'music.note': 'music_note',
  folder: 'folder',
  'square.stack.3d.down.right': 'layers',
  'square.stack.3d.up': 'layers',
  'arrow.down.to.line': 'vertical_align_bottom',
  'speaker.wave.2': 'volume_up',
  headphones: 'headphones',
  lock: 'lock',
  'lock.fill': 'lock',
  'lock.open': 'lock_open',
  'lock.open.fill': 'lock_open',
  'rectangle.expand.vertical': 'unfold_more',
  'rectangle.compress.vertical': 'unfold_less',
  'arrow.clockwise': 'refresh',
  'arrow.uturn.backward': 'undo',
  'checkmark.circle.fill': 'check_circle',
  circle: 'radio_button_unchecked',

  // RecordingPromptDialog
  'exclamationmark.triangle.fill': 'warning',
  'info.circle.fill': 'info',
  'gauge.with.dots.needle.33percent': 'speed',
  'battery.25': 'battery_2_bar',

  // Paywall / celebration
  sparkles: 'auto_awesome',
  'star.fill': 'star',
  'crown.fill': 'workspace_premium',
  'seal.fill': 'verified',
  paintbrush: 'brush',
  paintpalette: 'palette',
  repeat: 'repeat',
  doc: 'description',
};

type Props = {
  name: string;
  size?: number;
  tintColor?: ColorValue;
  style?: StyleProp<ViewStyle>;
  fallbackStyle?: StyleProp<TextStyle>;
};

function fallbackCharFor(name: string): string {
  return (name.replace(/[^a-zA-Z0-9]/g, '').charAt(0) || '•').toUpperCase();
}

function LetterFallback({
  char,
  size,
  tintColor,
  style,
  fallbackStyle,
}: {
  char: string;
  size: number;
  tintColor?: ColorValue;
  style?: StyleProp<ViewStyle>;
  fallbackStyle?: StyleProp<TextStyle>;
}) {
  return (
    <View style={[{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }, style]}>
      <Text
        allowFontScaling={false}
        style={[
          {
            color: tintColor,
            fontSize: size * 0.7,
            fontWeight: '600',
            lineHeight: size,
            textAlign: 'center',
            includeFontPadding: false,
          },
          fallbackStyle,
        ]}>
        {char}
      </Text>
    </View>
  );
}

/**
 * Android Material Symbols without expo-symbols SymbolView, which clips under
 * system font scale and stays blank while/if the font fails to load.
 */
function AndroidAppSymbol({ name, size = 24, tintColor, style, fallbackStyle }: Props) {
  const android = SF_TO_ANDROID[name];
  const fallbackChar = fallbackCharFor(name);
  const glyph = android ? androidSymbolToString(android) : null;
  const [loaded, setLoaded] = useState(() => isLoaded(regular.name));
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!glyph) {
      return;
    }
    if (isLoaded(regular.name)) {
      setLoaded(true);
      return;
    }
    let cancelled = false;
    loadAsync({
      [regular.name]: {
        uri: regular.font,
        testString: glyph,
      },
    })
      .then(() => {
        if (!cancelled) {
          setLoaded(true);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setFailed(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [glyph]);

  if (!glyph || failed || !loaded) {
    return (
      <LetterFallback
        char={fallbackChar}
        size={size}
        tintColor={tintColor}
        style={style}
        fallbackStyle={fallbackStyle}
      />
    );
  }

  return (
    <View style={[{ width: size, height: size, overflow: 'hidden' }, style]}>
      <Text
        allowFontScaling={false}
        style={{
          fontFamily: regular.name,
          color: tintColor,
          fontSize: size,
          lineHeight: size,
          width: size,
          height: size,
          textAlign: 'center',
          includeFontPadding: false,
        }}>
        {glyph}
      </Text>
    </View>
  );
}

export function androidSymbolForSf(name: string): AndroidSymbol | undefined {
  return SF_TO_ANDROID[name];
}

export function AppSymbol({ name, size = 24, tintColor, style, fallbackStyle }: Props) {
  if (Platform.OS === 'android') {
    return (
      <AndroidAppSymbol
        name={name}
        size={size}
        tintColor={tintColor}
        style={style}
        fallbackStyle={fallbackStyle}
      />
    );
  }

  const android = SF_TO_ANDROID[name];
  const fallbackChar = fallbackCharFor(name);

  return (
    <SymbolView
      name={{
        ios: name as SFSymbol,
        ...(android ? { android } : {}),
      }}
      size={size}
      tintColor={tintColor}
      style={style}
      fallback={
        <Text
          style={[
            {
              color: tintColor,
              fontSize: size * 0.7,
              fontWeight: '600',
              lineHeight: size,
              textAlign: 'center',
              width: size,
            },
            fallbackStyle,
          ]}>
          {fallbackChar}
        </Text>
      }
    />
  );
}
