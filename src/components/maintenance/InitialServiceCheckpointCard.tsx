import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import type { InitialServiceCheckpoint } from '../../maintenance/initialServiceCheckpoint';
import { formatNumber, useTranslation } from '../../i18n';

export default function InitialServiceCheckpointCard({
  checkpoint,
  onPress,
}: {
  checkpoint: InitialServiceCheckpoint;
  onPress: () => void;
}) {
  const { isRTL, locale, t } = useTranslation();
  const currentKm = checkpoint.milestoneKm - checkpoint.remainingKm;
  const urgent = checkpoint.status === 'overdue' || checkpoint.status === 'due';
  const bodyKey = checkpoint.status === 'overdue'
    ? 'initialService.bodyOverdue'
    : checkpoint.status === 'due'
      ? 'initialService.bodyDue'
      : 'initialService.bodyUpcoming';
  return (
    <TouchableOpacity
      accessibilityHint={t('initialService.cardHint')}
      accessibilityRole="button"
      className={`min-h-24 rounded-xl border p-4 flex-row items-start gap-3 ${urgent ? 'border-error/45 bg-error/10' : 'border-amber-500/35 bg-amber-500/10'}`}
      onPress={onPress}
    >
      <View className={`w-10 h-10 rounded-lg items-center justify-center ${urgent ? 'bg-error/15' : 'bg-amber-500/15'}`}>
        <MaterialIcons color={urgent ? '#ffb4ab' : '#f59e0b'} name={urgent ? 'warning-amber' : 'fact-check'} size={22} />
      </View>
      <View className="flex-1 min-w-0">
        <Text className="font-headline text-base font-bold text-on-surface">{t('initialService.title')}</Text>
        <Text className="font-body text-xs text-on-surface-variant mt-1 leading-5">
          {t(bodyKey, {
            current: formatNumber(currentKm, locale),
            milestone: formatNumber(checkpoint.milestoneKm, locale),
            overdue: formatNumber(Math.abs(checkpoint.remainingKm), locale),
          })}
        </Text>
        <Text className="font-label text-xs font-bold text-primary mt-3">
          {t('initialService.reviewWithCount', { count: formatNumber(checkpoint.actions.length, locale) })}
        </Text>
      </View>
      <MaterialIcons name={isRTL ? 'chevron-left' : 'chevron-right'} size={22} color="#a9c7ff" />
    </TouchableOpacity>
  );
}
