import { ActionSheetIOS, Alert, Platform } from 'react-native';

type ActionSheetOptions = {
  title?: string;
  options: string[];
  cancelButtonIndex?: number;
  destructiveButtonIndex?: number;
};

/**
 * iOS ActionSheet; Android Alert buttons (good enough for first Android milestone).
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

  const buttons = sheet.options.map((text, index) => {
    const isCancel = index === sheet.cancelButtonIndex;
    const isDestructive = index === sheet.destructiveButtonIndex;
    return {
      text,
      style: isCancel
        ? ('cancel' as const)
        : isDestructive
          ? ('destructive' as const)
          : ('default' as const),
      onPress: () => onSelect(index),
    };
  });

  Alert.alert(sheet.title ?? 'Choose an option', undefined, buttons, {
    cancelable: true,
  });
}
