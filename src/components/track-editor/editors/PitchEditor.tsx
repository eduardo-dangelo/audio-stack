import { useEffect, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import {
  MAX_PITCH_SEMITONES,
  MIN_PITCH_SEMITONES,
  type LayerEffects,
} from '@/src/audio/layerEffects';
import {
  canUsePitch,
  getEffectiveTierSync,
  requestUpgrade,
} from '@/src/billing';
import { useVoiceMemosColors } from '@/src/theme/useVoiceMemosColors';

import { EditorSlider } from '../primitives/EditorSlider';

type Props = {
  effects: LayerEffects;
  onChange: (pitchSemitones: number) => void;
};

const PITCH_STEP_COUNT = MAX_PITCH_SEMITONES - MIN_PITCH_SEMITONES;

export function PitchEditor({ effects, onChange }: Props) {
  const colors = useVoiceMemosColors();
  const styles = useStyles(colors);
  const allowed = canUsePitch(getEffectiveTierSync());

  useEffect(() => {
    if (!allowed) {
      requestUpgrade('pitch');
    }
  }, [allowed]);

  const handleChange = (pitchSemitones: number) => {
    if (!canUsePitch(getEffectiveTierSync())) {
      requestUpgrade('pitch');
      return;
    }
    onChange(pitchSemitones);
  };

  return (
    <View style={styles.container}>
      <EditorSlider
        maximumValue={MAX_PITCH_SEMITONES}
        minimumValue={MIN_PITCH_SEMITONES}
        showCenterTick
        stepCount={PITCH_STEP_COUNT}
        value={effects.pitchSemitones}
        onSlidingComplete={handleChange}
        onValueChange={handleChange}
      />
      <View style={styles.labels}>
        <Text style={styles.label}>−12</Text>
        <Text style={styles.label}>0</Text>
        <Text style={styles.label}>+12</Text>
      </View>
    </View>
  );
}

function useStyles(colors: ReturnType<typeof useVoiceMemosColors>) {
  return useMemo(
    () =>
      StyleSheet.create({
        container: {
          flex: 1,
          justifyContent: 'center',
          gap: 2,
        },
        labels: {
          flexDirection: 'row',
          justifyContent: 'space-between',
          paddingHorizontal: 14,
        },
        label: {
          fontSize: 11,
          color: colors.secondaryText,
        },
      }),
    [colors]
  );
}
