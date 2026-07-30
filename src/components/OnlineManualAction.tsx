import React, { useCallback, useRef, useState } from 'react';
import { Alert, Linking, Text, TouchableOpacity, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import * as Network from 'expo-network';
import type { ResolvedScooterSelection } from '../catalog/scooterCatalog';
import {
  getOnlineManualReference,
  isValidOnlineManualUrl,
  openOnlineManual,
} from '../catalog/manualLinks';

type Props = {
  selection: ResolvedScooterSelection | null;
};

export default function OnlineManualAction({ selection }: Props) {
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
        'You’re offline',
        'Connect to the internet to view this manual. The PDF is not stored in 3azza.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Try again', onPress: () => { void handleOpen(); } },
        ]
      );
    } else if (outcome === 'cannot-open') {
      Alert.alert(
        'The manual could not be opened',
        'Check your connection or PDF viewer, then try again. Nothing was downloaded.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Retry', onPress: () => { void handleOpen(); } },
        ]
      );
    }
  }, [opening, reference]);

  const available = isValidOnlineManualUrl(reference?.onlineManualUrl);
  const accessibilityLabel = reference
    ? `View the ${reference.manualName.replace(/ owner manual$/i, '')} ${reference.years} owner manual.`
    : 'View the selected vehicle owner manual.';

  return (
    <View className="mt-5 pt-5 border-t border-outline-variant/15">
      <View className="flex-row items-start gap-3">
        <View className="w-10 h-10 rounded-lg bg-primary/10 items-center justify-center">
          <MaterialIcons name="menu-book" size={21} color="#a9c7ff" />
        </View>
        <View className="flex-1">
          <Text className="font-headline text-sm font-bold text-on-surface">
            {reference?.manualName ?? 'Owner manual'}
          </Text>
          <Text className="font-label text-xs uppercase tracking-wider text-on-surface-variant mt-1">
            {reference ? `${reference.years} · Opens outside 3azza` : 'Select an exact model and version'}
          </Text>
        </View>
      </View>

      {available ? (
        <TouchableOpacity
          accessibilityRole="link"
          accessibilityLabel={accessibilityLabel}
          accessibilityHint="Opens the PDF outside 3azza in your browser or installed PDF viewer."
          accessibilityState={{ busy: opening, disabled: opening }}
          activeOpacity={0.82}
          className="mt-4 min-h-12 px-4 py-3 rounded-lg bg-primary flex-row items-center justify-center gap-2"
          disabled={opening}
          onPress={() => { void handleOpen(); }}
        >
          <Text className="font-label text-xs font-bold text-[#081421] uppercase tracking-widest">
            {opening ? 'Opening…' : 'View manual'}
          </Text>
          <MaterialIcons name="open-in-new" size={18} color="#081421" />
        </TouchableOpacity>
      ) : (
        <View
          accessibilityRole="link"
          accessibilityLabel={`${accessibilityLabel} Online manual unavailable.`}
          accessibilityState={{ disabled: true }}
          className="mt-4 min-h-12 px-4 py-3 rounded-lg bg-surface-container-high border border-outline-variant/20 flex-row items-center justify-center gap-2"
        >
          <Text className="font-body text-sm text-on-surface-variant">Online manual unavailable.</Text>
        </View>
      )}
    </View>
  );
}
