import React, { useCallback, useState } from 'react';
import { Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { getVehicleProfile } from '../services/database';
import { vehicleDisplayName } from '../i18n';

export default function ActiveVehicleChip() {
  const [name, setName] = useState<string | null>(null);

  useFocusEffect(useCallback(() => {
    let active = true;
    getVehicleProfile()
      .then((profile) => {
        if (active) setName(profile?.name ?? null);
      })
      .catch(() => {
        if (active) setName(null);
      });
    return () => { active = false; };
  }, []));

  if (!name) return null;
  return (
    <View className="self-start flex-row items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/10 border border-primary/20">
      <MaterialIcons name="two-wheeler" size={12} color="#a9c7ff" />
      <Text className="font-label text-xs uppercase tracking-widest text-primary" numberOfLines={1}>{vehicleDisplayName(name)}</Text>
    </View>
  );
}
