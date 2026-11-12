import { SymbolView, type AndroidSymbol } from 'expo-symbols';
import type { SFSymbol } from 'sf-symbols-typescript';
import { Text, type ColorValue, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';

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
  'speaker.wave.2': 'volume_up',
  headphones: 'headphones',
  lock: 'lock',
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

export function androidSymbolForSf(name: string): AndroidSymbol | undefined {
  return SF_TO_ANDROID[name];
}

export function AppSymbol({ name, size = 24, tintColor, style, fallbackStyle }: Props) {
  const android = SF_TO_ANDROID[name];
  const fallbackChar = (name.replace(/[^a-zA-Z0-9]/g, '').charAt(0) || '•').toUpperCase();

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
