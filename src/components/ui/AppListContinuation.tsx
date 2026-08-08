import { MaterialIcons } from '@expo/vector-icons';
import { Text, TouchableOpacity } from 'react-native';
import { useTranslation } from '../../i18n';

type AppListContinuationProps = {
  visible: boolean;
  onPress: () => void;
};

/** Accessible, shared affordance for incrementally revealing older local records. */
export default function AppListContinuation({ onPress, visible }: AppListContinuationProps) {
  const { t } = useTranslation();
  if (!visible) return null;

  return (
    <TouchableOpacity
      accessibilityLabel={t('common.loadOlder')}
      accessibilityRole="button"
      className="min-h-12 mt-6 mb-6 rounded-xl border border-outline-variant/30 bg-surface-container-high flex-row items-center justify-center gap-2 px-4"
      onPress={onPress}
    >
      <MaterialIcons name="expand-more" color="#c4c6cc" size={22} />
      <Text className="font-label text-sm font-bold uppercase tracking-wider text-on-surface">
        {t('common.loadOlder')}
      </Text>
    </TouchableOpacity>
  );
}
