import { Stack, router, useFocusEffect } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {
  Alert,
  InteractionManager,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import Animated, {
  FadeIn,
  FadeOut,
  LinearTransition,
  ZoomIn,
} from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Path, Stop, Text as SvgText } from 'react-native-svg';

import { useColorScheme } from '@/components/useColorScheme';
import { memoAudioEngine } from '@/src/audio/MemoAudioEngine';
import { AppSymbol } from '@/src/components/AppSymbol';
import { FloatingHeaderButton } from '@/src/components/FloatingHeaderButton';
import {
  GroupedListRow,
  GroupedListScreen,
  GroupedListSection,
  GroupedListSectionHeader,
} from '@/src/components/GroupedList';
import { NamePromptDialog } from '@/src/components/NamePromptDialog';
import {
  canCreateFolder,
  getEffectiveTierSync,
  isBillingLimitError,
  requestUpgrade,
  useBilling,
  tierDisplayName,
  type TierId,
} from '@/src/billing';
import { sendFeedbackEmail } from '@/src/feedback/sendFeedback';
import { sideColumnIconItem, useDuoSideColumn } from '@/src/hooks/useDuoSideColumn';
import { useFolders } from '@/src/hooks/useFolders';
import { useLibraryCounts } from '@/src/hooks/useLibraryCounts';
import {
  getAppSettings,
  setLocationBasedNaming,
  setThemePreference,
  type ThemePreference,
} from '@/src/settings/appSettings';
import { createFolder, deleteFolder, reorderFolders } from '@/src/storage/folderStore';
import {
  getThemePreferenceLive,
  publishThemePreference,
  subscribeTheme,
} from '@/src/theme/themeStore';
import { ThemePickerModal } from '@/src/components/ThemePickerModal';
import {
  canUseNamedTheme,
  INLINE_EDITOR_THEMES,
  isProOnlyTheme,
  PRO_ONLY_EDITOR_THEMES,
  resolveEffectiveTheme,
} from '@/src/theme/themes';
import { useVoiceMemosColors } from '@/src/theme/useVoiceMemosColors';
import { endIdlePlaybackLiveActivities } from '@/src/widgets/recordingLiveActivityController';

const PRO_STAR_PATH =
  'M7.50 0.30L9.29 5.03L14.35 5.28L10.40 8.44L11.73 13.32L7.50 10.55L3.27 13.32L4.60 8.44L0.65 5.28L5.71 5.03Z';

/** Home-title Pro mark: a diagonal sheen of blue tones. */
function ProTierMark() {
  const width = 52;
  const height = 16;
  return (
    <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <Defs>
        <LinearGradient
          id="homeProMetal"
          x1="0"
          y1="0"
          x2={width}
          y2={height}
          gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor="#6AABFF" />
          <Stop offset="0.4" stopColor="#2B7FFF" />
          <Stop offset="0.7" stopColor="#1A66E0" />
          <Stop offset="1" stopColor="#4C96FF" />
        </LinearGradient>
      </Defs>
      <Path d={PRO_STAR_PATH} fill="url(#homeProMetal)" transform="translate(0 1.2)" />
      <SvgText fill="url(#homeProMetal)" fontSize={15} fontWeight="600" x={19} y={13.2}>
        Pro
      </SvgText>
    </Svg>
  );
}

/** Android: SvgText matches Pro metrics; accent fill (no gradient). */
function PlusTierMark({ accentColor }: { accentColor: string }) {
  return (
    <>
      <AppSymbol name="sparkles" size={15} tintColor={accentColor} />
      <Svg width={36} height={16} viewBox="0 0 36 16">
        <SvgText fill={accentColor} fontSize={15} fontWeight="600" x={0} y={13.2}>
          Plus
        </SvgText>
      </Svg>
    </>
  );
}

function HomeTierMark({
  tier,
  accentColor,
  labelStyle,
  rowStyle,
  animate,
}: {
  tier: Exclude<TierId, 'lite'>;
  accentColor: string;
  labelStyle: object;
  rowStyle: object;
  /** Zoom in only on a real upgrade — not on cold start / remount. */
  animate: boolean;
}) {
  return (
    <Animated.View
      key={tier}
      entering={
        animate ? ZoomIn.springify().damping(13).stiffness(170) : undefined
      }
      exiting={FadeOut.duration(160)}
      style={rowStyle}>
      {tier === 'pro' ? (
        <ProTierMark />
      ) : Platform.OS === 'android' ? (
        <PlusTierMark accentColor={accentColor} />
      ) : (
        <>
          <AppSymbol name="sparkles" size={15} tintColor={accentColor} />
          <Text style={[labelStyle, { color: accentColor }]}>Plus</Text>
        </>
      )}
    </Animated.View>
  );
}

export default function FoldersHomeScreen() {
  const colors = useVoiceMemosColors();
  const colorScheme = useColorScheme();
  const sideColumn = useDuoSideColumn();
  const styles = useStyles(colors, colorScheme);
  const headerStyles = useHeaderStyles(colors, colorScheme);
  const { folders, refresh: refreshFolders } = useFolders();
  const { counts, refresh: refreshCounts } = useLibraryCounts();
  const [editMode, setEditMode] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [themeModalVisible, setThemeModalVisible] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const scrollInnerRef = useRef<View>(null);
  const settingsHeaderRef = useRef<View>(null);
  const pendingScrollToSettings = useRef(false);
  const [newFolderVisible, setNewFolderVisible] = useState(false);
  const [locationBasedNaming, setLocationBasedNamingEnabled] = useState(true);
  const themePreference = useSyncExternalStore(
    subscribeTheme,
    getThemePreferenceLive,
    getThemePreferenceLive
  );
  const {
    effectiveTier,
    openPaywall,
    restore,
    setDevTierOverride,
    devTierOverride,
  } = useBilling();

  const previousTierRef = useRef<TierId | null>(null);
  const shouldAnimateTierMark = useMemo(() => {
    const previous = previousTierRef.current;
    if (previous == null) {
      return false;
    }
    if (previous === 'lite' && (effectiveTier === 'plus' || effectiveTier === 'pro')) {
      return true;
    }
    return previous === 'plus' && effectiveTier === 'pro';
  }, [effectiveTier]);

  useEffect(() => {
    previousTierRef.current = effectiveTier;
  }, [effectiveTier]);

  const refresh = () => {
    refreshFolders();
    refreshCounts();
  };

  useEffect(() => {
    void getAppSettings().then((settings) => {
      setLocationBasedNamingEnabled(settings.locationBasedNaming);
      publishThemePreference(settings.themePreference);
    });
  }, []);

  useFocusEffect(
    useCallback(() => {
      void endIdlePlaybackLiveActivities(memoAudioEngine);
      return () => {
        setShowSettings(false);
      };
    }, [])
  );

  const folderRows = useMemo(() => folders, [folders]);
  const hasFolders = folderRows.length > 0;

  useEffect(() => {
    if (!hasFolders && editMode) {
      setEditMode(false);
    }
  }, [editMode, hasFolders]);

  const moveFolder = (folderId: string, direction: -1 | 1) => {
    const index = folderRows.findIndex((folder) => folder.id === folderId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= folderRows.length) {
      return;
    }
    const orderedIds = folderRows.map((folder) => folder.id);
    [orderedIds[index], orderedIds[target]] = [orderedIds[target], orderedIds[index]];
    void reorderFolders(orderedIds).then(refresh);
  };

  const confirmDeleteFolder = (folderId: string, name: string) => {
    Alert.alert('Delete Folder', `Delete "${name}"? Recordings will remain in All Recordings.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          void deleteFolder(folderId).then(refresh);
        },
      },
    ]);
  };

  const selectedProThemeLabel = isProOnlyTheme(themePreference)
    ? PRO_ONLY_EDITOR_THEMES.find((theme) => theme.id === themePreference)?.label
    : null;
  const canOpenThemeModal = effectiveTier === 'pro';
  const lockedThemeIds = useMemo(() => {
    const locked = new Set<string>();
    for (const theme of INLINE_EDITOR_THEMES) {
      if (!canUseNamedTheme(effectiveTier, theme.id)) {
        locked.add(theme.id);
      }
    }
    for (const theme of PRO_ONLY_EDITOR_THEMES) {
      if (!canUseNamedTheme(effectiveTier, theme.id)) {
        locked.add(theme.id);
      }
    }
    return locked;
  }, [effectiveTier]);

  const openThemePickerOrPaywall = useCallback(() => {
    if (!canOpenThemeModal) {
      requestUpgrade('themes');
      return;
    }
    setThemeModalVisible(true);
  }, [canOpenThemeModal]);

  const selectThemePreference = (pref: ThemePreference) => {
    if (!canUseNamedTheme(effectiveTier, pref)) {
      requestUpgrade('themes');
      return;
    }
    publishThemePreference(pref);
    void setThemePreference(pref);
  };

  const appliedPreference = resolveEffectiveTheme(themePreference, effectiveTier);
  const overrideEnabled = appliedPreference !== 'system';

  const toggleOverride = (enabled: boolean) => {
    if (!enabled) {
      selectThemePreference('system');
      return;
    }
    selectThemePreference(colorScheme === 'dark' ? 'dark' : 'light');
  };

  const handleNewFolder = useCallback(() => {
    if (!canCreateFolder(getEffectiveTierSync())) {
      requestUpgrade('folders');
      return;
    }
    setNewFolderVisible(true);
  }, []);

  const toggleSettings = useCallback(() => {
    setShowSettings((current) => {
      const next = !current;
      if (next) pendingScrollToSettings.current = true;
      return next;
    });
  }, []);

  const scrollSettingsIntoView = useCallback(() => {
    if (!pendingScrollToSettings.current) return;
    pendingScrollToSettings.current = false;

    InteractionManager.runAfterInteractions(() => {
      requestAnimationFrame(() => {
        const header = settingsHeaderRef.current;
        const inner = scrollInnerRef.current;
        const scroll = scrollRef.current;
        if (!header || !inner || !scroll) return;

        header.measureLayout(
          inner,
          (_x, y) => {
            scroll.scrollTo({ y: Math.max(0, y - 8), animated: true });
          },
          () => {}
        );
      });
    });
  }, []);

  const toggleEditMode = useCallback(() => {
    setEditMode((current) => !current);
  }, []);

  const headerScreenOptions = useMemo(
    () => ({
      title: '',
      headerLargeTitle: false,
      headerShadowVisible: false,
      headerTintColor: colors.text,
      headerStyle: { backgroundColor: headerStyles.canvasColor },
      headerLargeStyle: { backgroundColor: headerStyles.canvasColor },
      contentStyle: { backgroundColor: headerStyles.canvasColor },
      ...(Platform.OS === 'ios'
        ? {
            unstable_headerRightItems: () => {
              if (sideColumn.active) {
                return [
                  sideColumnIconItem({
                    label: showSettings ? 'Hide settings' : 'Show settings',
                    icon: showSettings ? 'gearshape.fill' : 'gearshape',
                    onPress: toggleSettings,
                    tintColor: colors.text,
                  }),
                  sideColumnIconItem({
                    label: 'New folder',
                    icon: 'folder.badge.plus',
                    onPress: handleNewFolder,
                    tintColor: colors.text,
                  }),
                  ...(hasFolders
                    ? [
                        sideColumnIconItem({
                          label: editMode ? 'Done editing folders' : 'Edit folders',
                          icon: editMode ? 'checkmark' : 'pencil',
                          onPress: toggleEditMode,
                          tintColor: colors.text,
                        }),
                      ]
                    : []),
                ];
              }

              const items = [
                {
                  type: 'custom' as const,
                  hidesSharedBackground: true,
                  sharesBackground: false,
                  element: (
                    <FloatingHeaderButton
                      accessibilityLabel={showSettings ? 'Hide settings' : 'Show settings'}
                      icon={showSettings ? 'gearshape.fill' : 'gearshape'}
                      onPress={toggleSettings}
                    />
                  ),
                },
                {
                  type: 'custom' as const,
                  hidesSharedBackground: true,
                  sharesBackground: false,
                  element: (
                    <FloatingHeaderButton
                      accessibilityLabel="New folder"
                      icon="folder.badge.plus"
                      onPress={handleNewFolder}
                    />
                  ),
                },
              ];
              if (hasFolders) {
                items.push({
                  type: 'custom' as const,
                  hidesSharedBackground: true,
                  sharesBackground: false,
                  element: (
                    <FloatingHeaderButton
                      accessibilityLabel={editMode ? 'Done editing folders' : 'Edit folders'}
                      label={editMode ? 'Done' : 'Edit'}
                      variant="pill"
                      onPress={toggleEditMode}
                    />
                  ),
                });
              }
              return items;
            },
          }
        : {
            headerRight: () => (
              <View style={styles.headerActions}>
                <FloatingHeaderButton
                  accessibilityLabel={showSettings ? 'Hide settings' : 'Show settings'}
                  icon={showSettings ? 'gearshape.fill' : 'gearshape'}
                  onPress={toggleSettings}
                />
                <FloatingHeaderButton
                  accessibilityLabel="New folder"
                  icon="folder.badge.plus"
                  onPress={handleNewFolder}
                />
                {hasFolders ? (
                  <FloatingHeaderButton
                    accessibilityLabel={editMode ? 'Done editing folders' : 'Edit folders'}
                    label={editMode ? 'Done' : 'Edit'}
                    variant="pill"
                    onPress={toggleEditMode}
                  />
                ) : null}
              </View>
            ),
          }),
    }),
    [
      colors.text,
      editMode,
      handleNewFolder,
      hasFolders,
      headerStyles.canvasColor,
      showSettings,
      sideColumn.active,
      styles.headerActions,
      toggleEditMode,
      toggleSettings,
    ]
  );

  return (
    <>
      <Stack.Screen options={headerScreenOptions} />
      <NamePromptDialog
        initialValue="New Folder"
        title="New Folder"
        visible={newFolderVisible}
        onCancel={() => setNewFolderVisible(false)}
        onSave={(value) => {
          setNewFolderVisible(false);
          void createFolder(value.trim() || 'New Folder')
            .then(() => {
              refreshFolders();
              refreshCounts();
            })
            .catch((error) => {
              if (isBillingLimitError(error)) {
                requestUpgrade(error.reason);
                return;
              }
              Alert.alert(
                'Could not create folder',
                error instanceof Error ? error.message : 'Unknown error'
              );
            });
        }}
      />
      <GroupedListScreen
        ref={scrollRef}
        innerViewRef={scrollInnerRef}
        largeTitle="Audio Stack"
        largeTitleTrailing={
          effectiveTier === 'lite' ? null : (
            <HomeTierMark
              tier={effectiveTier}
              accentColor={colors.accent}
              labelStyle={styles.tierMarkLabel}
              rowStyle={styles.tierMark}
              animate={shouldAnimateTierMark}
            />
          )
        }>
        <GroupedListSection>
          <GroupedListRow
            count={counts.allCount}
            icon="waveform"
            isFirst
            title="All Recordings"
            onPress={() => router.push('/recordings')}
          />
          <GroupedListRow
            count={counts.trashCount}
            icon="trash"
            isLast
            title="Recently Deleted"
            onPress={() => router.push('/recently-deleted')}
          />
        </GroupedListSection>

        {hasFolders ? (
          <>
            <GroupedListSectionHeader title="My Folders" />
            <GroupedListSection>
              {folderRows.map((folder, index) => (
                <GroupedListRow
                  key={folder.id}
                  accessory={
                    editMode ? (
                      <View style={styles.editControls}>
                        <Pressable
                          disabled={index === 0}
                          hitSlop={8}
                          onPress={() => moveFolder(folder.id, -1)}
                          style={index === 0 ? styles.disabledControl : undefined}>
                          <SymbolView
                            name={{ ios: 'chevron.up' }}
                            size={14}
                            tintColor={colors.secondaryText}
                          />
                        </Pressable>
                        <Pressable
                          disabled={index === folderRows.length - 1}
                          hitSlop={8}
                          onPress={() => moveFolder(folder.id, 1)}
                          style={
                            index === folderRows.length - 1 ? styles.disabledControl : undefined
                          }>
                          <SymbolView
                            name={{ ios: 'chevron.down' }}
                            size={14}
                            tintColor={colors.secondaryText}
                          />
                        </Pressable>
                        <Pressable
                          hitSlop={8}
                          onPress={() => confirmDeleteFolder(folder.id, folder.name)}>
                          <SymbolView
                            name={{ ios: 'minus.circle.fill' }}
                            size={22}
                            tintColor={colors.recordRed}
                          />
                        </Pressable>
                      </View>
                    ) : undefined
                  }
                  count={counts.folderCounts[folder.id] ?? 0}
                  icon="folder"
                  isFirst={index === 0}
                  isLast={index === folderRows.length - 1}
                  showChevron={!editMode}
                  showCount={!editMode}
                  title={folder.name}
                  onPress={
                    editMode
                      ? undefined
                      : () =>
                          router.push({
                            pathname: '/folder/[id]',
                            params: { id: folder.id, name: folder.name },
                          })
                  }
                />
              ))}
            </GroupedListSection>
          </>
        ) : null}

        {showSettings ? (
          <Animated.View
            entering={FadeIn.duration(220)}
            exiting={FadeOut.duration(160)}
            layout={LinearTransition.duration(220)}>
            <View
              ref={settingsHeaderRef}
              collapsable={false}
              onLayout={scrollSettingsIntoView}>
              <GroupedListSectionHeader title="Settings" />
            </View>
            <GroupedListSection>
              <View
                style={[styles.settingsRow, !overrideEnabled && styles.settingsRowBorder]}>
                <SymbolView
                  name={{ ios: 'paintbrush.fill' }}
                  size={20}
                  tintColor={colors.accent}
                />
                <View style={styles.settingsCopy}>
                  <Text style={styles.settingsTitle}>Appearance</Text>
                  <Text style={styles.settingsSubtitle}>
                    Off follows your system setting. Turn on to choose a theme.
                  </Text>
                </View>
                <Switch value={overrideEnabled} onValueChange={toggleOverride} />
              </View>
              {overrideEnabled ? (
                <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(140)}>
                  {INLINE_EDITOR_THEMES.map((theme) => {
                    const selected = themePreference === theme.id;
                    const locked = lockedThemeIds.has(theme.id);
                    return (
                      <Pressable
                        key={theme.id}
                        accessibilityRole="button"
                        accessibilityState={{ selected, disabled: locked }}
                        onPress={() => selectThemePreference(theme.id)}
                        style={({ pressed }) => [
                          styles.settingsRow,
                          styles.settingsRowNested,
                          styles.settingsRowBorder,
                          pressed && styles.settingsRowPressed,
                        ]}>
                        <Text
                          style={[
                            styles.settingsTitle,
                            selected && !locked && styles.settingsThemeActive,
                          ]}>
                          {theme.label}
                        </Text>
                        {locked ? (
                          <SymbolView
                            name={{ ios: 'lock.fill' }}
                            size={14}
                            tintColor={colors.secondaryText}
                          />
                        ) : selected ? (
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
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ disabled: !canOpenThemeModal }}
                    onPress={openThemePickerOrPaywall}
                    style={({ pressed }) => [
                      styles.settingsRow,
                      styles.settingsRowNested,
                      styles.settingsRowBorder,
                      pressed && styles.settingsRowPressed,
                    ]}>
                    <View style={styles.settingsCopy}>
                      <Text
                        style={[
                          styles.settingsTitle,
                          selectedProThemeLabel ? styles.settingsThemeActive : null,
                        ]}>
                        Select Theme
                      </Text>
                      <Text style={styles.settingsSubtitle}>
                        {selectedProThemeLabel ?? 'More themes…'}
                      </Text>
                    </View>
                    {canOpenThemeModal ? (
                      <SymbolView
                        name={{ ios: 'chevron.right' }}
                        size={14}
                        tintColor={colors.secondaryText}
                      />
                    ) : (
                      <SymbolView
                        name={{ ios: 'lock.fill' }}
                        size={14}
                        tintColor={colors.secondaryText}
                      />
                    )}
                  </Pressable>
                </Animated.View>
              ) : null}
              <View style={[styles.settingsRow, styles.settingsRowBorder]}>
                <SymbolView
                  name={{ ios: 'location.fill' }}
                  size={20}
                  tintColor={colors.accent}
                />
                <View style={styles.settingsCopy}>
                  <Text style={styles.settingsTitle}>Location-based Naming</Text>
                  <Text style={styles.settingsSubtitle}>
                    Name new recordings using your current location.
                  </Text>
                </View>
                <Switch
                  value={locationBasedNaming}
                  onValueChange={(enabled) => {
                    setLocationBasedNamingEnabled(enabled);
                    void setLocationBasedNaming(enabled);
                  }}
                />
              </View>
              <Pressable
                accessibilityRole="button"
                onPress={() => openPaywall(null)}
                style={({ pressed }) => [
                  styles.settingsRow,
                  styles.settingsRowBorder,
                  pressed ? styles.settingsRowPressed : null,
                ]}>
                <SymbolView
                  name={{ ios: 'crown.fill' }}
                  size={20}
                  tintColor={colors.accent}
                />
                <View style={styles.settingsCopy}>
                  <Text style={styles.settingsTitle}>Plan</Text>
                  <Text style={styles.settingsSubtitle}>
                    Current: {tierDisplayName(effectiveTier)}
                  </Text>
                </View>
                <SymbolView
                  name={{ ios: 'chevron.right' }}
                  size={14}
                  tintColor={colors.secondaryText}
                />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  void restore();
                }}
                style={({ pressed }) => [
                  styles.settingsRow,
                  styles.settingsRowBorder,
                  pressed ? styles.settingsRowPressed : null,
                ]}>
                <SymbolView
                  name={{ ios: 'arrow.clockwise' }}
                  size={20}
                  tintColor={colors.accent}
                />
                <View style={styles.settingsCopy}>
                  <Text style={styles.settingsTitle}>Restore Purchases</Text>
                  <Text style={styles.settingsSubtitle}>
                    Restore Plus or Pro on this device
                  </Text>
                </View>
              </Pressable>
              {__DEV__ ? (
                <View style={[styles.settingsRow, styles.settingsRowBorder]}>
                  <SymbolView
                    name={{ ios: 'hammer.fill' }}
                    size={20}
                    tintColor={colors.accent}
                  />
                  <View style={styles.settingsCopy}>
                    <Text style={styles.settingsTitle}>Dev Tier</Text>
                    <Text style={styles.settingsSubtitle}>
                      Override StoreKit for local testing
                    </Text>
                    <View style={styles.devTierRow}>
                      {(['store', 'lite', 'plus', 'pro'] as const).map((option) => {
                        const selected =
                          option === 'store'
                            ? devTierOverride === null
                            : devTierOverride === option;
                        return (
                          <Pressable
                            key={option}
                            accessibilityRole="button"
                            onPress={() => {
                              void setDevTierOverride(
                                option === 'store' ? null : (option as TierId)
                              );
                            }}
                            style={[
                              styles.devTierChip,
                              selected ? styles.devTierChipSelected : null,
                            ]}>
                            <Text
                              style={[
                                styles.devTierChipLabel,
                                selected ? styles.devTierChipLabelSelected : null,
                              ]}>
                              {option === 'store' ? 'Store' : tierDisplayName(option)}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                </View>
              ) : null}
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  void sendFeedbackEmail();
                }}
                style={({ pressed }) => [
                  styles.settingsRow,
                  pressed ? styles.settingsRowPressed : null,
                ]}>
                <SymbolView
                  name={{ ios: 'envelope' }}
                  size={20}
                  tintColor={colors.accent}
                />
                <View style={styles.settingsCopy}>
                  <Text style={styles.settingsTitle}>Send Feedback</Text>
                  <Text style={styles.settingsSubtitle}>
                    Share ideas, bugs, or screenshots
                  </Text>
                </View>
                <SymbolView
                  name={{ ios: 'chevron.right' }}
                  size={14}
                  tintColor={colors.secondaryText}
                />
              </Pressable>
            </GroupedListSection>
          </Animated.View>
        ) : null}
      </GroupedListScreen>
      <ThemePickerModal
        visible={themeModalVisible}
        themes={PRO_ONLY_EDITOR_THEMES}
        selectedId={themePreference}
        lockedIds={lockedThemeIds}
        onSelect={(id) => {
          selectThemePreference(id);
        }}
        onClose={() => setThemeModalVisible(false)}
      />
    </>
  );
}

function useHeaderStyles(
  colors: ReturnType<typeof useVoiceMemosColors>,
  colorScheme: 'light' | 'dark' | null | undefined
) {
  return useMemo(
    () => ({
      canvasColor:
        colorScheme === 'dark' ? colors.background : colors.editorCanvasBackground,
    }),
    [colorScheme, colors.background, colors.editorCanvasBackground]
  );
}

function useStyles(
  colors: ReturnType<typeof useVoiceMemosColors>,
  colorScheme: 'light' | 'dark' | null | undefined
) {
  const nestedSurface =
    colorScheme === 'dark' ? colors.pillBackground : colors.editorCanvasBackground;

  return useMemo(
    () =>
      StyleSheet.create({
        tierMark: {
          flexDirection: 'row',
          alignItems: 'center',
          flexShrink: 0,
          gap: 4,
          marginBottom: 4,
        },
        tierMarkLabel: {
          fontSize: 15,
          fontWeight: '600',
        },
        headerActions: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
        },
        editControls: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
        },
        disabledControl: {
          opacity: 0.3,
        },
        settingsRow: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          paddingHorizontal: 16,
          paddingVertical: 12,
          minHeight: 58,
        },
        settingsRowBorder: {
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: colors.separator,
        },
        settingsRowNested: {
          minHeight: 48,
          paddingLeft: 32,
          backgroundColor: nestedSurface,
        },
        settingsRowPressed: {
          opacity: 0.55,
        },
        settingsCopy: {
          flex: 1,
          gap: 2,
        },
        settingsTitle: {
          color: colors.text,
          fontSize: 17,
        },
        settingsThemeActive: {
          color: colors.accent,
          fontWeight: '600',
        },
        settingsSubtitle: {
          color: colors.secondaryText,
          fontSize: 13,
        },
        devTierRow: {
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: 8,
          marginTop: 8,
        },
        devTierChip: {
          borderRadius: 8,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.separator,
          paddingHorizontal: 10,
          paddingVertical: 6,
        },
        devTierChipSelected: {
          borderColor: colors.accent,
          backgroundColor: colors.accent,
        },
        devTierChipLabel: {
          fontSize: 13,
          color: colors.text,
          fontWeight: '600',
        },
        devTierChipLabelSelected: {
          color: '#fff',
        },
      }),
    [nestedSurface, colors.accent, colors.secondaryText, colors.separator, colors.text]
  );
}
