import { GlassView, isGlassEffectAPIAvailable } from 'expo-glass-effect';
import { SymbolView } from 'expo-symbols';
import { useMemo, type ReactNode } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { useColorScheme } from '@/components/useColorScheme';
import type { ThemePreference } from '@/src/settings/appSettings';
import type { EditorThemeChoice } from '@/src/theme/themes';
import { useVoiceMemosColors } from '@/src/theme/useVoiceMemosColors';

const useGlass = isGlassEffectAPIAvailable();

type ThemePickerModalProps = {
  visible: boolean;
  themes: readonly EditorThemeChoice[];
  selectedId: ThemePreference;
  onSelect: (id: Exclude<ThemePreference, 'system'>) => void;
  onClose: () => void;
};

export function ThemePickerModal({
  visible,
  themes,
  selectedId,
  onSelect,
  onClose,
}: ThemePickerModalProps) {
  const colors = useVoiceMemosColors();
  const colorScheme = useColorScheme();
  const styles = useStyles(colors, colorScheme);

  return (
    <Modal
      animationType={useGlass ? 'none' : 'fade'}
      transparent
      visible={visible}
      onRequestClose={onClose}>
      <Pressable
        style={[styles.backdrop, useGlass && styles.backdropGlass]}
        onPress={onClose}>
        <DialogCard styles={styles} colorScheme={colorScheme}>
          <View style={styles.header}>
            <Text style={styles.title}>Select Theme</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Done"
              hitSlop={8}
              onPress={onClose}>
              <Text style={styles.done}>Done</Text>
            </Pressable>
          </View>
          <ScrollView
            bounces={false}
            style={styles.list}
            contentContainerStyle={styles.listContent}
            keyboardShouldPersistTaps="handled">
            {themes.map((theme, index) => {
              const selected = selectedId === theme.id;
              const isLast = index === themes.length - 1;
              return (
                <Pressable
                  key={theme.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => onSelect(theme.id)}
                  style={({ pressed }) => [
                    styles.row,
                    !isLast && styles.rowBorder,
                    pressed && styles.rowPressed,
                  ]}>
                  <Text style={[styles.rowLabel, selected && styles.rowLabelSelected]}>
                    {theme.label}
                  </Text>
                  {selected ? (
                    <SymbolView
                      name={{ ios: 'checkmark' }}
                      size={16}
                      weight="semibold"
                      tintColor={colors.accent}
                    />
                  ) : null}
                </Pressable>
              );
            })}
          </ScrollView>
        </DialogCard>
      </Pressable>
    </Modal>
  );
}

function DialogCard({
  styles,
  colorScheme,
  children,
}: {
  styles: ReturnType<typeof useStyles>;
  colorScheme: 'light' | 'dark' | null | undefined;
  children: ReactNode;
}) {
  return (
    <Pressable style={styles.cardPressable} onPress={() => {}}>
      {useGlass ? (
        <GlassView
          colorScheme={colorScheme === 'dark' ? 'dark' : 'light'}
          glassEffectStyle="regular"
          isInteractive
          style={styles.cardGlass}>
          {children}
        </GlassView>
      ) : (
        <View style={styles.cardFallback}>{children}</View>
      )}
    </Pressable>
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
          backgroundColor: colors.overlayBackground,
          justifyContent: 'center',
          alignItems: 'center',
          padding: 24,
        },
        backdropGlass: {
          backgroundColor:
            colorScheme === 'dark' ? 'rgba(0, 0, 0, 0.35)' : 'rgba(0, 0, 0, 0.22)',
        },
        cardPressable: {
          width: '100%',
          maxWidth: 340,
          maxHeight: '70%',
        },
        cardGlass: {
          borderRadius: 20,
          overflow: 'hidden',
          maxHeight: '100%',
        },
        cardFallback: {
          borderRadius: 20,
          overflow: 'hidden',
          maxHeight: '100%',
          backgroundColor: cardSurface,
        },
        header: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 20,
          paddingTop: 16,
          paddingBottom: 12,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: colors.separator,
        },
        title: {
          fontSize: 17,
          fontWeight: '600',
          color: colors.text,
        },
        done: {
          fontSize: 17,
          fontWeight: '600',
          color: colors.accent,
        },
        list: {
          flexGrow: 0,
        },
        listContent: {
          paddingBottom: 8,
        },
        row: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          minHeight: 48,
          paddingHorizontal: 20,
          paddingVertical: 12,
        },
        rowBorder: {
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: colors.separator,
        },
        rowPressed: {
          opacity: 0.55,
        },
        rowLabel: {
          flex: 1,
          fontSize: 17,
          color: colors.text,
        },
        rowLabelSelected: {
          color: colors.accent,
          fontWeight: '600',
        },
      }),
    [cardSurface, colorScheme, colors.accent, colors.overlayBackground, colors.separator, colors.text]
  );
}
