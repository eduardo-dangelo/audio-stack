import {
  beginAndroidStatusNotificationGeneration,
  hideAndroidStatusNotification,
  showAndroidStatusNotification,
} from './androidStatusNotifications';

export type RecordingActivityProps = {
  memoId: string;
  memoTitle: string;
  activityKind: 'recording' | 'playback';
  recordingStartedAt: number;
  startTime: number;
  playbackStartedAt: number;
  playbackOffset: number;
  mode: 'new' | 'stack' | 'replace';
  layerId: string | null;
  trackColor: string | null;
};

type AndroidLiveActivity = {
  end: (_dismissal: 'immediate' | string) => Promise<void>;
  update: (props: RecordingActivityProps) => Promise<void>;
};

let active: AndroidLiveActivity | null = null;

/**
 * Android has no ActivityKit. Map the Live Activity API surface to ongoing
 * foreground-service notifications via Recording/PlaybackNotificationManager.
 */
const RecordingActivity = {
  start(props: RecordingActivityProps, _url?: string): AndroidLiveActivity {
    const generation = beginAndroidStatusNotificationGeneration();
    void showAndroidStatusNotification(props, generation);

    const handle: AndroidLiveActivity = {
      update: async (next) => {
        if (active !== handle) {
          return;
        }
        await showAndroidStatusNotification(next, generation);
      },
      end: async () => {
        if (active === handle) {
          active = null;
        }
        // Only hide if this generation is still current — avoids wiping a newer show.
        await hideAndroidStatusNotification(generation);
      },
    };

    active = handle;
    return handle;
  },
  getInstances(): AndroidLiveActivity[] {
    return active ? [active] : [];
  },
};

export default RecordingActivity;
