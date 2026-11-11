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

type StubLiveActivity = {
  end: (_dismissal: 'immediate' | string) => Promise<void>;
  update: (_props: RecordingActivityProps) => Promise<void>;
};

function createStubActivity(): StubLiveActivity {
  return {
    end: async () => {},
    update: async () => {},
  };
}

/** Android has no ActivityKit; keep the Live Activity API surface as no-ops. */
const RecordingActivity = {
  start(_props: RecordingActivityProps, _url?: string): StubLiveActivity {
    return createStubActivity();
  },
  getInstances(): StubLiveActivity[] {
    return [];
  },
};

export default RecordingActivity;
