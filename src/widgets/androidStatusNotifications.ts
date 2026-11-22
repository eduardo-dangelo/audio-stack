import { PermissionsAndroid, Platform } from 'react-native';
import {
  PlaybackNotificationManager,
  RecordingNotificationManager,
} from 'react-native-audio-api';

import type { RecordingActivityProps } from './RecordingLiveActivity.android';

type StatusMode = 'idle' | 'recording' | 'playback';

let mode: StatusMode = 'idle';
let notificationGeneration = 0;
let listenersInstalled = false;
let playbackControlsEnabled = false;
let unsubscribePlayback: (() => void) | null = null;
let lastPostedPlaybackSec = -1;
let permissionRequested = false;

function getMemoAudioEngine() {
  // Lazy require avoids a cycle: engine → controller → LiveActivity.android → this module.
  return require('@/src/audio/MemoAudioEngine')
    .memoAudioEngine as import('@/src/audio/MemoAudioEngine').MemoAudioEngine;
}

/** Bump and return a generation so stale end() cannot hide a newer notification. */
export function beginAndroidStatusNotificationGeneration(): number {
  notificationGeneration += 1;
  return notificationGeneration;
}

async function ensurePostNotificationsPermission(): Promise<void> {
  if (Platform.OS !== 'android') {
    return;
  }
  if (permissionRequested) {
    return;
  }
  permissionRequested = true;

  const version =
    typeof Platform.Version === 'number'
      ? Platform.Version
      : Number.parseInt(String(Platform.Version), 10);
  if (!Number.isFinite(version) || version < 33) {
    return;
  }

  try {
    const granted = await PermissionsAndroid.check(
      PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS
    );
    if (granted) {
      return;
    }
    await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS
    );
  } catch {
    // Best-effort — show() may still work when the system grants by default.
  }
}

function stopPlaybackProgressSync(): void {
  unsubscribePlayback?.();
  unsubscribePlayback = null;
  lastPostedPlaybackSec = -1;
}

function startPlaybackProgressSync(): void {
  stopPlaybackProgressSync();
  const engine = getMemoAudioEngine();
  unsubscribePlayback = engine.subscribe((state) => {
    if (mode !== 'playback' || !state.isPlaying) {
      return;
    }
    const sec = Math.floor(state.currentTime);
    if (sec === lastPostedPlaybackSec) {
      return;
    }
    lastPostedPlaybackSec = sec;
    void PlaybackNotificationManager.show({
      elapsedTime: state.currentTime,
      state: 'playing',
      duration: state.duration > 0 ? state.duration : undefined,
    }).catch(() => {});
  });
}

async function enablePlaybackControlsOnce(): Promise<void> {
  if (playbackControlsEnabled) {
    return;
  }
  playbackControlsEnabled = true;
  await Promise.all([
    PlaybackNotificationManager.enableControl('play', true),
    PlaybackNotificationManager.enableControl('pause', true),
    PlaybackNotificationManager.enableControl('stop', true),
    PlaybackNotificationManager.enableControl('seekTo', true),
    PlaybackNotificationManager.enableControl('skipForward', true),
    PlaybackNotificationManager.enableControl('skipBackward', true),
  ]);
}

/** Status-only chrome while recording — no inert stop/pause that look broken. */
async function enableRecordingMediaStyleControls(): Promise<void> {
  playbackControlsEnabled = false;
  await Promise.all([
    PlaybackNotificationManager.enableControl('pause', false),
    PlaybackNotificationManager.enableControl('play', false),
    PlaybackNotificationManager.enableControl('stop', false),
    PlaybackNotificationManager.enableControl('seekTo', false),
    PlaybackNotificationManager.enableControl('skipForward', false),
    PlaybackNotificationManager.enableControl('skipBackward', false),
  ]);
}

function installNotificationActionListeners(): void {
  if (listenersInstalled || Platform.OS !== 'android') {
    return;
  }
  listenersInstalled = true;

  PlaybackNotificationManager.addEventListener(
    'playbackNotificationPause',
    () => {
      if (mode === 'recording') {
        // Recording MediaStyle chrome — do not drive playback transport.
        return;
      }
      getMemoAudioEngine().pause();
    }
  );
  PlaybackNotificationManager.addEventListener(
    'playbackNotificationPlay',
    () => {
      if (mode === 'recording') {
        return;
      }
      void getMemoAudioEngine().play();
    }
  );
  PlaybackNotificationManager.addEventListener(
    'playbackNotificationStop',
    () => {
      if (mode === 'recording') {
        return;
      }
      getMemoAudioEngine().pause();
    }
  );
  PlaybackNotificationManager.addEventListener(
    'playbackNotificationDismissed',
    () => {
      if (mode === 'recording') {
        return;
      }
      getMemoAudioEngine().pause();
    }
  );
  PlaybackNotificationManager.addEventListener(
    'playbackNotificationSeekTo',
    (event) => {
      if (mode === 'recording') {
        return;
      }
      getMemoAudioEngine().seek(event.value);
    }
  );
  PlaybackNotificationManager.addEventListener(
    'playbackNotificationSkipForward',
    (event) => {
      if (mode === 'recording') {
        return;
      }
      const seconds = typeof event.value === 'number' ? event.value : 15;
      getMemoAudioEngine().skip(seconds);
    }
  );
  PlaybackNotificationManager.addEventListener(
    'playbackNotificationSkipBackward',
    (event) => {
      if (mode === 'recording') {
        return;
      }
      const seconds = typeof event.value === 'number' ? event.value : 15;
      getMemoAudioEngine().skip(-seconds);
    }
  );
}

/**
 * Recording chrome via MediaStyle only — RecordingNotificationManager custom
 * RemoteViews can report active while nothing is visible in the shade.
 */
async function showRecordingNotification(
  props: RecordingActivityProps,
  generation: number
): Promise<void> {
  if (mode === 'playback') {
    stopPlaybackProgressSync();
    playbackControlsEnabled = false;
  }

  if (generation !== notificationGeneration) {
    return;
  }

  mode = 'recording';
  const title = props.memoTitle || 'Recording';

  // Clear any stale native recording notify from older builds / paths.
  await RecordingNotificationManager.hide().catch(() => {});
  if (generation !== notificationGeneration) {
    return;
  }

  await PlaybackNotificationManager.show({
    title,
    artist: 'Recording',
    state: 'playing',
  });
  if (generation !== notificationGeneration) {
    return;
  }
  await enableRecordingMediaStyleControls();

  if (__DEV__) {
    console.log(
      '[androidStatusNotifications] recording MediaStyle shown',
      title
    );
  }
}

async function showPlaybackNotification(
  props: RecordingActivityProps,
  generation: number
): Promise<void> {
  if (mode === 'recording') {
    await RecordingNotificationManager.hide().catch(() => {});
  }

  if (generation !== notificationGeneration) {
    return;
  }

  mode = 'playback';
  const engine = getMemoAudioEngine();
  const state = engine.getState();
  await PlaybackNotificationManager.show({
    title: props.memoTitle || 'Audio Stack',
    artist: 'Audio Stack',
    state: state.isPlaying ? 'playing' : 'paused',
    elapsedTime: props.playbackOffset,
    duration: state.duration > 0 ? state.duration : undefined,
  });
  if (generation !== notificationGeneration) {
    return;
  }
  await enablePlaybackControlsOnce();
  startPlaybackProgressSync();
}

/**
 * Show or update the Android FGS status notification for recording or playback.
 * Mirrors iOS Live Activity start/update via the shared controller.
 */
export async function showAndroidStatusNotification(
  props: RecordingActivityProps,
  generation: number
): Promise<void> {
  if (Platform.OS !== 'android') {
    return;
  }
  if (generation !== notificationGeneration) {
    return;
  }

  await ensurePostNotificationsPermission();
  if (generation !== notificationGeneration) {
    return;
  }
  installNotificationActionListeners();

  try {
    if (props.activityKind === 'recording') {
      await showRecordingNotification(props, generation);
    } else {
      await showPlaybackNotification(props, generation);
    }
  } catch (error) {
    if (__DEV__) {
      console.warn('[androidStatusNotifications] show failed', error);
    }
  }
}

/**
 * Hide recording + playback notifications and stop progress sync.
 * When `forGeneration` is set, no-op if a newer activity has already started.
 */
export async function hideAndroidStatusNotification(
  forGeneration?: number
): Promise<void> {
  if (Platform.OS !== 'android') {
    return;
  }
  if (
    forGeneration !== undefined &&
    forGeneration !== notificationGeneration
  ) {
    return;
  }

  mode = 'idle';
  stopPlaybackProgressSync();
  playbackControlsEnabled = false;

  await Promise.all([
    RecordingNotificationManager.hide().catch(() => {}),
    PlaybackNotificationManager.hide().catch(() => {}),
  ]);
}
