import type { ComponentProps } from 'react';
import { Text, TextInput, View } from 'react-native';

type AppTextFieldProps = ComponentProps<typeof TextInput> & {
  error?: string | null;
  label: string;
  containerClassName?: string;
};

/** Consistent label, input surface, and inline validation treatment for forms. */
export default function AppTextField({
  containerClassName = '',
  error,
  label,
  ...inputProps
}: AppTextFieldProps) {
  return (
    <View className={containerClassName}>
      <Text className="font-label text-xs uppercase font-bold text-muted tracking-widest mb-2">
        {label}
      </Text>
      <TextInput
        accessibilityLabel={inputProps.accessibilityLabel ?? label}
        accessibilityState={{ disabled: inputProps.editable === false }}
        className={`bg-surface-container-high rounded-xl px-4 py-3 text-on-surface font-body border ${error ? 'border-error' : 'border-outline-variant/20'}`}
        placeholderTextColor="#64748b"
        {...inputProps}
      />
      {error ? <Text className="text-error font-body text-xs mt-2">{error}</Text> : null}
    </View>
  );
}
