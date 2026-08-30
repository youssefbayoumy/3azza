import type { ReactNode } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AppIconButton from './AppIconButton';
import { useTranslation } from '../../i18n';

type AppBottomSheetProps = {
  children: ReactNode;
  title: string;
  onClose: () => void;
  closeDisabled?: boolean;
  sheetStyle?: StyleProp<ViewStyle>;
};

/** Shared visual shell for write forms presented from the bottom of a screen. */
export default function AppBottomSheet({
  children,
  closeDisabled = false,
  onClose,
  sheetStyle,
  title,
}: AppBottomSheetProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  return (
    <View className="flex-1 justify-end">
      <View
        className="bg-surface-container rounded-t-3xl p-6 border-t border-outline-variant/20"
        style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 24) }, sheetStyle]}
      >
        <View className="flex-row justify-between items-center mb-6">
          <Text accessibilityRole="header" className="font-headline text-xl font-bold text-on-surface">{title}</Text>
          <AppIconButton
            accessibilityLabel={t('common.closeTitle', { title })}
            color="#c4c6cc"
            disabled={closeDisabled}
            icon="close"
            onPress={onClose}
          />
        </View>
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    alignSelf: 'center',
    maxWidth: 640,
    width: '100%',
  },
});
