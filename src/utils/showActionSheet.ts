import { ActionSheetIOS, Platform } from 'react-native';

import { presentAndroidActionSheet } from '@/src/components/AndroidActionSheetHost';

type ActionSheetOptions = {
  title?: string;
  options: string[];
  cancelButtonIndex?: number;
  destructiveButtonIndex?: number;
  /** Muted look only — still selectable (native iOS disabled blocks taps). */
  disabledButtonIndices?: number[];
};

/**
 * iOS ActionSheet; Android vertical list modal (Alert buttons lay out horizontally).
 * When any option is visually disabled-but-tappable, both platforms use the custom list
 * (ActionSheetIOS disabledButtonIndices would block the paywall tap).
 */
export function showActionSheet(
  sheet: ActionSheetOptions,
  onSelect: (index: number) => void
): void {
  const useCustomSheet =
    Platform.OS !== 'ios' || (sheet.disabledButtonIndices?.length ?? 0) > 0;

  if (!useCustomSheet) {
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title: sheet.title,
        options: sheet.options,
        cancelButtonIndex: sheet.cancelButtonIndex,
        destructiveButtonIndex: sheet.destructiveButtonIndex,
      },
      onSelect
    );
    return;
  }

  presentAndroidActionSheet({
    title: sheet.title,
    options: sheet.options,
    cancelButtonIndex: sheet.cancelButtonIndex,
    destructiveButtonIndex: sheet.destructiveButtonIndex,
    disabledButtonIndices: sheet.disabledButtonIndices,
    onSelect,
  });
}
