import { router } from 'expo-router';

import type { MemoAudioEngine } from '@/src/audio/MemoAudioEngine';
import { getSession } from '@/src/recording/activeRecordingSession';

/**
 * When a recording is still live (or playback is active via the Android status
 * notification) but the user opened the app without a deep link, land them on
 * the active memo. RecordingNotificationManager in 0.12.2 has no deepLinkUri;
 * notification taps open the launcher and AppState 'active' calls this.
 */
export function maybeNavigateToActiveRecording(engine: MemoAudioEngine): void {
  const state = engine.getState();

  if (state.isRecording) {
    const session = getSession();
    if (!session) {
      return;
    }

    router.navigate({
      pathname: '/memo/[id]',
      params: { id: session.memoId },
    });
    return;
  }

  if (state.isPlaying && state.memoId) {
    router.navigate({
      pathname: '/memo/[id]',
      params: { id: state.memoId },
    });
  }
}
