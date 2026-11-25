import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { MoveSnapSelection } from '@/src/audio/moveSnap';
import { getMoveSnapOptions } from '@/src/audio/moveSnap';
import type { MetronomeSettings } from '@/src/storage/types';
import { useVoiceMemosColors } from '@/src/theme/useVoiceMemosColors';

import { PresetPills } from '../primitives/PresetPills';

type Props = {
  settings: MetronomeSettings;
  selection: MoveSnapSelection;
  onChange: (selection: MoveSnapSelection) => void;
};

export function EditSnapEditor({ settings, selection, onChange }: Props) {
  const colors = useVoiceMemosColors();
  const styles = useStyles(colors);
  const options = getMoveSnapOptions(settings);

  return (
    <View style={styles.container}>
      <View style={styles.presetRow}>
        <View style={styles.group}>
          <Text style={styles.caption}>snap:</Text>
          <PresetPills
            compact
            options={options}
            selectedId={selection}
            onSelect={onChange}
          />
        </View>
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
        },
        presetRow: {
          width: '100%',
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-around',
          paddingHorizontal: 8,
        },
        group: {
          flexDirection: 'row',
          alignItems: 'center',
          flexShrink: 1,
          gap: 4,
        },
        caption: {
          fontSize: 12,
          color: colors.secondaryText,
        },
      }),
    [colors]
  );
}
