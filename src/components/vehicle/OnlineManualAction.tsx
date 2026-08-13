import React, { useCallback, useRef, useState } from 'react';
import { Alert, Linking, Text, TouchableOpacity, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import * as Network from 'expo-network';
import type { ResolvedScooterSelection } from '../../catalog/scooterCatalog';
import {
  getOnlineManualReference,
  isValidOnlineManualUrl,
  openOnlineManual,
} from '../../catalog/manualLinks';
import { useTranslation } from '../../i18n';

type Props = {
  selection: ResolvedScooterSelection | null;
};

export default function OnlineManualAction({ selection }: Props) {
  const { isRTL, t } = useTranslation();
  const reference = getOnlineManualReference(selection);
  const activeManualIdRef = useRef<string | null>(reference?.manualId ?? null);
  const [opening, setOpening] = useState(false);
  activeManualIdRef.current = reference?.manualId ?? null;

  const handleOpen = useCallback(async () => {
    if (!reference || !isValidOnlineManualUrl(reference.onlineManualUrl) || opening) return;
    const requestedManualId = reference.manualId;
    setOpening(true);
    const outcome = await openOnlineManual(reference.onlineManualUrl, {
      getNetworkState: Network.getNetworkStateAsync,
      canOpenURL: Linking.canOpenURL,
      openURL: Linking.openURL,
      isStillActive: () => activeManualIdRef.current === requestedManualId,
    });
    setOpening(false);

    if (outcome === 'offline') {
      Alert.alert(
        t('manual.offlineTitle'),
        t('manual.offlineBody'),
        [
          { text: t('common.cancel'), style: 'cancel' },
          { text: t('manual.tryAgain'), onPress: () => { void handleOpen(); } },
        ]
      );
    } else if (outcome === 'cannot-open') {
      Alert.alert(
        t('manual.openFailedTitle'),
        t('manual.openFailedBody'),
        [
          { text: t('common.cancel'), style: 'cancel' },
          { text: t('common.retry'), onPress: () => { void handleOpen(); } },
        ]
      );
    }
  }, [opening, reference, t]);

  const available = isValidOnlineManualUrl(reference?.onlineManualUrl);
  const accessibilityLabel = reference
    ? `View the ${reference.manualName.replace(/ owner manual$/i, '')} ${reference.years} owner manual.`
    : t('manual.viewSelected');

  return (
    <View className="mt-5 pt-5 border-t border-outline-variant/15">
      <View className="flex-row items-start gap-3">
        <View className="w-10 h-10 rounded-lg bg-primary/10 items-center justify-center">
          <MaterialIcons name="menu-book" size={21} color="#a9c7ff" />
        </View>
        <View className="flex-1">
          <Text className="font-headline text-sm font-bold text-on-surface">
            {reference?.manualName ?? t('manual.ownerManual')}
          </Text>
          <Text className="font-label text-xs uppercase tracking-wider text-on-surface-variant mt-1">
            {reference ? `${reference.years} · ${t('manual.opensOutside')}` : t('manual.selectExact')}
          </Text>
        </View>
      </View>
      {isRTL ? <Text className="font-body text-xs text-on-surface-variant mt-3">{t('common.manualEnglishNotice')}</Text> : null}

      {available ? (
        <TouchableOpacity
          accessibilityRole="link"
          accessibilityLabel={accessibilityLabel}
          accessibilityHint={t('manual.openHint')}
          accessibilityState={{ busy: opening, disabled: opening }}
          activeOpacity={0.82}
          className="mt-4 min-h-12 px-4 py-3 rounded-lg bg-primary flex-row items-center justify-center gap-2"
          disabled={opening}
          onPress={() => { void handleOpen(); }}
        >
          <Text className="font-label text-xs font-bold text-[#081421] uppercase tracking-widest">
            {opening ? t('manual.opening') : t('manual.view')}
          </Text>
          <MaterialIcons name="open-in-new" size={18} color="#081421" />
        </TouchableOpacity>
      ) : (
        <View
          accessibilityRole="link"
          accessibilityLabel={`${accessibilityLabel} ${t('manual.unavailable')}`}
          accessibilityState={{ disabled: true }}
          className="mt-4 min-h-12 px-4 py-3 rounded-lg bg-surface-container-high border border-outline-variant/20 flex-row items-center justify-center gap-2"
        >
          <Text className="font-body text-sm text-on-surface-variant">{t('manual.unavailable')}</Text>
        </View>
      )}
    </View>
  );
}
