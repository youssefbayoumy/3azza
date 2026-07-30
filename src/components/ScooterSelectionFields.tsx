import { useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import {
  resolveScooterSelection,
  scooterCatalog,
  type ScooterSelection,
} from '../catalog/scooterCatalog';

type SelectionKey = 'brandId' | 'modelId' | 'versionId';

type Props = {
  value: Partial<ScooterSelection>;
  onChange: (selection: Partial<ScooterSelection>) => void;
  showErrors?: boolean;
};

export default function ScooterSelectionFields({ onChange, showErrors = false, value }: Props) {
  const [openField, setOpenField] = useState<SelectionKey | null>(null);
  const brand = scooterCatalog.manufacturers.find((item) => item.id === value.brandId);
  const model = brand?.models.find((item) => item.id === value.modelId);
  const resolved = resolveScooterSelection(value);

  const fields = [
    {
      key: 'brandId' as const,
      label: 'Brand',
      placeholder: 'Select brand',
      disabled: false,
      selectedName: brand?.name,
      options: scooterCatalog.manufacturers,
    },
    {
      key: 'modelId' as const,
      label: 'Model',
      placeholder: brand ? 'Select model' : 'Select a brand first',
      disabled: !brand,
      selectedName: model?.name,
      options: brand?.models ?? [],
    },
    {
      key: 'versionId' as const,
      label: 'Version / Variant',
      placeholder: model ? 'Select version' : 'Select a model first',
      disabled: !model,
      selectedName: resolved?.version.name,
      options: model?.versions ?? [],
    },
  ];

  const select = (key: SelectionKey, id: string) => {
    if (key === 'brandId') onChange({ brandId: id });
    if (key === 'modelId') onChange({ brandId: value.brandId, modelId: id });
    if (key === 'versionId') onChange({ ...value, versionId: id });
    setOpenField(null);
  };

  return (
    <View className="gap-4">
      {fields.map((field, index) => {
        const missing = showErrors && !value[field.key];
        return (
          <View key={field.key}>
            <View className="flex-row items-center gap-3 mb-2">
              <View className="w-7 h-7 rounded-full bg-primary/15 items-center justify-center">
                <Text className="font-label text-xs font-bold text-primary">{index + 1}</Text>
              </View>
              <Text className="font-label text-xs uppercase font-bold text-on-surface-variant tracking-widest">
                {field.label}
              </Text>
            </View>
            <TouchableOpacity
              accessibilityLabel={`${field.label}: ${field.selectedName ?? field.placeholder}`}
              accessibilityRole="button"
              accessibilityState={{ disabled: field.disabled, expanded: openField === field.key }}
              className={`min-h-14 px-4 py-3 rounded-xl border flex-row items-center justify-between ${
                missing ? 'border-error bg-error/5' : 'border-outline-variant/30 bg-surface-container-high'
              } ${field.disabled ? 'opacity-45' : ''}`}
              disabled={field.disabled}
              onPress={() => setOpenField((current) => current === field.key ? null : field.key)}
            >
              <Text className={`font-body text-base flex-1 ${field.selectedName ? 'text-on-surface' : 'text-on-surface-variant'}`}>
                {field.selectedName ?? field.placeholder}
              </Text>
              <MaterialIcons name={openField === field.key ? 'expand-less' : 'expand-more'} size={22} color="#a9c7ff" />
            </TouchableOpacity>
            {missing ? <Text className="text-error font-body text-xs mt-1">{field.label} is required.</Text> : null}
            {openField === field.key ? (
              <View className="mt-2 rounded-xl overflow-hidden border border-outline-variant/20 bg-surface-container-lowest">
                {field.options.map((option) => (
                  <TouchableOpacity
                    key={option.id}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: value[field.key] === option.id }}
                    className="px-4 py-3 border-b border-outline-variant/10 flex-row items-center justify-between"
                    onPress={() => select(field.key, option.id)}
                  >
                    <Text className="font-body text-sm text-on-surface flex-1">{option.name}</Text>
                    {value[field.key] === option.id ? <MaterialIcons name="check" size={18} color="#a9c7ff" /> : null}
                  </TouchableOpacity>
                ))}
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}
