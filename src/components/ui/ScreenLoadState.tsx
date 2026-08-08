import { MaterialIcons } from '@expo/vector-icons';
import { ActivityIndicator, Text, View } from 'react-native';
import AppIconButton from './AppIconButton';
import AppPrimaryButton from './AppPrimaryButton';
import AppScreen from './AppScreen';
import AppTopBar from './AppTopBar';
import { useTranslation } from '../../i18n';

type ScreenLoadStateProps = {
  error: string | null;
  loading: boolean;
  onBack?: () => void;
  onRetry: () => void;
  title: string;
};

/** Full-screen loading and recoverable failure UI for database-backed screens. */
export default function ScreenLoadState({ error, loading, onBack, onRetry, title }: ScreenLoadStateProps) {
  const { isRTL, t } = useTranslation();
  return (
    <AppScreen>
      <AppTopBar
        tone="subtle"
        leading={onBack
          ? <AppIconButton accessibilityLabel={t('common.back')} icon={isRTL ? 'arrow-forward' : 'arrow-back'} onPress={onBack} />
          : undefined}
      >
        <Text className="font-headline uppercase tracking-widest text-sm font-bold text-primary">{title}</Text>
      </AppTopBar>

      <View
        accessibilityLiveRegion="polite"
        accessibilityRole={error ? 'alert' : undefined}
        className="flex-1 items-center justify-center px-8"
      >
        {loading ? (
          <>
            <ActivityIndicator accessibilityLabel={t('common.loading', { title })} size="large" color="#a9c7ff" />
            <Text className="font-body text-sm text-on-surface-variant mt-4">{t('common.loadingRecords')}</Text>
          </>
        ) : (
          <View className="w-full max-w-md bg-surface-container-low border border-error/30 rounded-xl p-8 items-center">
            <MaterialIcons name="error-outline" size={48} color="#ffb4ab" />
            <Text className="font-headline text-xl font-bold text-on-surface mt-4">{t('common.loadFailed')}</Text>
            <Text className="font-body text-sm text-on-surface-variant text-center leading-5 mt-2">{error}</Text>
            <AppPrimaryButton
              accessibilityLabel={t('common.retryLoading', { title })}
              className="w-full mt-6"
              label={t('common.retry')}
              onPress={onRetry}
            />
          </View>
        )}
      </View>
    </AppScreen>
  );
}
