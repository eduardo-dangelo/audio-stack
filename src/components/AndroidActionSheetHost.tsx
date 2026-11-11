import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { useColorScheme } from '@/components/useColorScheme';
import { useVoiceMemosColors } from '@/src/theme/useVoiceMemosColors';

export type AndroidActionSheetRequest = {
  title?: string;
  options: string[];
  cancelButtonIndex?: number;
  destructiveButtonIndex?: number;
  onSelect: (index: number) => void;
};

type ShowHandler = (request: AndroidActionSheetRequest) => void;

let showHandler: ShowHandler | null = null;

/** Imperative entry for Android choice sheets (vertical list, not Alert buttons). */
export function presentAndroidActionSheet(request: AndroidActionSheetRequest): void {
  if (showHandler == null) {
    return;
  }
  showHandler(request);
}

/** Mount once near the app root so `presentAndroidActionSheet` can present. */
export function AndroidActionSheetHost() {
  const colors = useVoiceMemosColors();
  const colorScheme = useColorScheme();
  const styles = useStyles(colors, colorScheme);

  const [visible, setVisible] = useState(false);
  const [title, setTitle] = useState<string | undefined>();
  const [options, setOptions] = useState<string[]>([]);
  const [cancelButtonIndex, setCancelButtonIndex] = useState<number | undefined>();
  const [destructiveButtonIndex, setDestructiveButtonIndex] = useState<
    number | undefined
  >();
  const onSelectRef = useRef<((index: number) => void) | undefined>(undefined);

  useLayoutEffect(() => {
    showHandler = (request) => {
      setTitle(request.title);
      setOptions(request.options);
      setCancelButtonIndex(request.cancelButtonIndex);
      setDestructiveButtonIndex(request.destructiveButtonIndex);
      onSelectRef.current = request.onSelect;
      setVisible(true);
    };
    return () => {
      showHandler = null;
    };
  }, []);

  const dismissWithCancel = () => {
    setVisible(false);
    const onSelect = onSelectRef.current;
    onSelectRef.current = undefined;
    if (cancelButtonIndex != null) {
      onSelect?.(cancelButtonIndex);
    }
  };

  const selectOption = (index: number) => {
    setVisible(false);
    const onSelect = onSelectRef.current;
    onSelectRef.current = undefined;
    onSelect?.(index);
  };

  return (
    <Modal
      animationType="fade"
      transparent
      visible={visible}
      onRequestClose={dismissWithCancel}>
      <Pressable
        accessibilityRole="button"
        style={styles.backdrop}
        onPress={dismissWithCancel}>
        <Pressable
          style={styles.cardPressable}
          onPress={(event) => event.stopPropagation()}>
          <View style={styles.card}>
            {title ? <Text style={styles.title}>{title}</Text> : null}
            {options.map((label, index) => {
              const isCancel = index === cancelButtonIndex;
              const isDestructive = index === destructiveButtonIndex;
              return (
                <View key={`${index}-${label}`}>
                  {isCancel ? <View style={styles.cancelDivider} /> : null}
                  <Pressable
                    accessibilityRole="button"
                    style={styles.row}
                    onPress={() => {
                      if (isCancel) {
                        dismissWithCancel();
                        return;
                      }
                      selectOption(index);
                    }}>
                    <Text
                      style={[
                        styles.rowLabel,
                        isDestructive && styles.rowLabelDestructive,
                        isCancel && styles.rowLabelCancel,
                      ]}>
                      {label}
                    </Text>
                  </Pressable>
                </View>
              );
            })}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function useStyles(
  colors: ReturnType<typeof useVoiceMemosColors>,
  colorScheme: 'light' | 'dark' | null | undefined
) {
  const cardSurface =
    colorScheme === 'dark' ? colors.sheetBackground : colors.background;

  return useMemo(
    () =>
      StyleSheet.create({
        backdrop: {
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: colors.overlayBackground,
          padding: 24,
        },
        cardPressable: {
          width: '100%',
          maxWidth: 320,
        },
        card: {
          backgroundColor: cardSurface,
          borderRadius: 20,
          overflow: 'hidden',
          elevation: 8,
        },
        title: {
          fontSize: 17,
          fontWeight: '600',
          color: colors.text,
          textAlign: 'center',
          paddingTop: 18,
          paddingBottom: 6,
          paddingHorizontal: 18,
        },
        row: {
          minHeight: 52,
          paddingHorizontal: 18,
          justifyContent: 'center',
          alignItems: 'center',
        },
        rowLabel: {
          fontSize: 17,
          color: colors.text,
          textAlign: 'center',
        },
        rowLabelDestructive: {
          color: colors.recordRed,
        },
        rowLabelCancel: {
          color: colors.secondaryText,
        },
        cancelDivider: {
          height: StyleSheet.hairlineWidth,
          backgroundColor: colors.separator,
          marginTop: 4,
        },
      }),
    [cardSurface, colors]
  );
}
