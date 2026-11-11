import { ActionSheetIOS, Platform } from 'react-native';

import { presentAndroidActionSheet } from '@/src/components/AndroidActionSheetHost';

type ActionSheetOptions = {
  title?: string;
  options: string[];
  cancelButtonIndex?: number;
  destructiveButtonIndex?: number;
};

/**
 * iOS ActionSheet; Android vertical list modal (Alert buttons lay out horizontally).
 */
export function showActionSheet(
  sheet: ActionSheetOptions,
  onSelect: (index: number) => void
): void {
  if (Platform.OS === 'ios') {
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
    onSelect,
  });
}
