import { Platform } from 'react-native';
import {
  Easing,
  FadeIn,
  FadeInDown,
  FadeInUp,
  FadeOut,
  FadeOutDown,
  FadeOutUp,
  LinearTransition,
} from 'react-native-reanimated';

const isIOS = Platform.OS === 'ios';

/** LinearTransition / list layout thrash — iOS only (expensive on Android). */
export const ENABLE_LAYOUT_TRANSITIONS = isIOS;

const ANDROID_FADE_MS = 120;

const listTransition = LinearTransition.duration(220).easing(
  Easing.bezier(0.33, 0, 0.2, 1)
);

export const LIST_ITEM_TRANSITION = ENABLE_LAYOUT_TRANSITIONS ? listTransition : undefined;

export const LIST_ITEM_ENTER = isIOS
  ? FadeIn.duration(180)
  : FadeIn.duration(ANDROID_FADE_MS);

export const LIST_ITEM_EXIT = isIOS
  ? FadeOut.duration(180)
  : FadeOut.duration(ANDROID_FADE_MS);

/** Waveform track stack — iOS slide; Android short opacity fade. */
export const TRACK_ROW_ENTER = isIOS
  ? FadeInDown.duration(280)
  : FadeIn.duration(ANDROID_FADE_MS);

export const TRACK_ROW_EXIT = isIOS
  ? FadeOutUp.duration(220)
  : FadeOut.duration(ANDROID_FADE_MS);

/** FAB mount — iOS spring slide; Android short opacity fade. */
export const FAB_ENTER = isIOS
  ? FadeInUp.springify().damping(24).stiffness(280)
  : FadeIn.duration(ANDROID_FADE_MS);

export const FAB_EXIT = isIOS
  ? FadeOutDown.duration(180)
  : FadeOut.duration(ANDROID_FADE_MS);

/** Tier mark / precount — iOS ZoomIn-style spring elsewhere; Android short fade. */
export const SHORT_FADE_IN = isIOS ? FadeIn.duration(180) : FadeIn.duration(ANDROID_FADE_MS);

export const SHORT_FADE_OUT = isIOS ? FadeOut.duration(160) : FadeOut.duration(ANDROID_FADE_MS);
