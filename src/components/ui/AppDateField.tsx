import { useEffect, useState } from 'react';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { MaterialIcons } from '@expo/vector-icons';
import { Platform, Text, TouchableOpacity, View } from 'react-native';
import { formatDate, useTranslation } from '../../i18n';
import { parseIsoDate, toIsoDate } from '../../utils/dates';

type AppDateFieldProps = {
  accessibilityLabel?: string;
  containerClassName?: string;
  disabled?: boolean;
  error?: string | null;
  label: string;
  maximumDate?: Date;
  minimumDate?: Date;
  onChange: (value: string) => void;
  value: string;
};

/** A form field backed by the platform calendar while preserving ISO dates in app state. */
export default function AppDateField({
  accessibilityLabel,
  containerClassName = '',
  disabled = false,
  error,
  label,
  maximumDate,
  minimumDate,
  onChange,
  value,
}: AppDateFieldProps) {
  const { locale } = useTranslation();
  const [showPicker, setShowPicker] = useState(false);
  const parsedValue = parseIsoDate(value) ?? new Date();

  useEffect(() => {
    if (disabled) setShowPicker(false);
  }, [disabled]);

  const handleChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
    if (Platform.OS === 'android' || event.type === 'dismissed') setShowPicker(false);
    if (event.type === 'set' && selectedDate) onChange(toIsoDate(selectedDate));
  };

  return (
    <View className={containerClassName}>
      {label ? (
        <Text className="font-label text-xs uppercase font-bold text-on-surface-variant/60 tracking-widest mb-2">
          {label}
        </Text>
      ) : null}
      <TouchableOpacity
        accessibilityLabel={accessibilityLabel ?? label}
        accessibilityRole="button"
        accessibilityState={{ disabled }}
        activeOpacity={disabled ? 1 : 0.8}
        className={`rounded-xl border px-4 py-3 flex-row items-center justify-between ${disabled ? 'bg-surface-container-low opacity-50' : 'bg-surface-container-high'} ${error ? 'border-error' : 'border-outline-variant/20'}`}
        disabled={disabled}
        onPress={() => setShowPicker(true)}
      >
        <Text className="text-on-surface font-body">{formatDate(parsedValue, locale)}</Text>
        <MaterialIcons color={disabled ? '#64748b' : '#a9c7ff'} name="calendar-today" size={19} />
      </TouchableOpacity>
      {showPicker ? (
        <DateTimePicker
          display={Platform.OS === 'ios' ? 'inline' : 'default'}
          maximumDate={maximumDate}
          minimumDate={minimumDate}
          mode="date"
          onChange={handleChange}
          value={parsedValue}
        />
      ) : null}
      {error ? <Text className="text-error font-body text-xs mt-2">{error}</Text> : null}
    </View>
  );
}
